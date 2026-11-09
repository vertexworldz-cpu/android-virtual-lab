<?php
declare(strict_types=1);

namespace Bladezux;

/**
 * Two-way metadata reconciliation between MySQL and the Drive app folder.
 * Drive is the source of truth for names, sizes and existence.
 */
final class Sync
{
    public static function run(): array
    {
        @set_time_limit(300);
        $root = GoogleDrive::rootFolderId();
        $stats = ['folders_added' => 0, 'files_added' => 0, 'updated' => 0, 'removed' => 0];

        $knownFolders = [];
        foreach (Database::all('SELECT id, drive_folder_id, name, parent_id FROM folders') as $f) {
            $knownFolders[$f['drive_folder_id']] = $f;
        }
        $knownFiles = [];
        foreach (Database::all('SELECT id, drive_file_id, name, size, folder_id FROM files') as $f) {
            $knownFiles[$f['drive_file_id']] = $f;
        }

        $seenFolders = [];
        $seenFiles = [];
        $queue = [[$root, null]];
        $visited = 0;
        while ($queue && $visited++ < 5000) {
            [$driveId, $localId] = array_shift($queue);
            foreach (GoogleDrive::listChildren($driveId) as $item) {
                if (($item['mimeType'] ?? '') === GoogleDrive::FOLDER_MIME) {
                    $seenFolders[$item['id']] = true;
                    if (isset($knownFolders[$item['id']])) {
                        $row = $knownFolders[$item['id']];
                        if ($row['name'] !== $item['name'] || (int) ($row['parent_id'] ?? 0) !== (int) ($localId ?? 0)) {
                            Database::run('UPDATE folders SET name = :n, parent_id = :p WHERE id = :id', ['n' => $item['name'], 'p' => $localId, 'id' => $row['id']]);
                            $stats['updated']++;
                        }
                        $folderLocalId = (int) $row['id'];
                    } else {
                        $folderLocalId = Database::insert('INSERT INTO folders (parent_id, name, drive_folder_id, created_by) VALUES (:p, :n, :d, NULL)',
                            ['p' => $localId, 'n' => $item['name'], 'd' => $item['id']]);
                        $stats['folders_added']++;
                    }
                    $queue[] = [$item['id'], $folderLocalId];
                    continue;
                }
                if (str_starts_with((string) ($item['mimeType'] ?? ''), 'application/vnd.google-apps.')) {
                    continue; // native Google Docs have no binary size; not managed here
                }
                $seenFiles[$item['id']] = true;
                $known = $knownFiles[$item['id']] ?? null;
                if ($known && $known['name'] === $item['name'] && (int) $known['size'] === (int) ($item['size'] ?? 0)
                    && (int) ($known['folder_id'] ?? 0) === (int) ($localId ?? 0)) {
                    continue;
                }
                Files::record($item, $localId, null);
                $known ? $stats['updated']++ : $stats['files_added']++;
            }
        }

        // Anything in MySQL that Drive no longer lists inside the app folder.
        foreach ($knownFiles as $driveId => $row) {
            if (!isset($seenFiles[$driveId]) && self::goneFromDrive($driveId)) {
                Database::run('DELETE FROM files WHERE id = :id', ['id' => $row['id']]);
                $stats['removed']++;
            }
        }
        foreach ($knownFolders as $driveId => $row) {
            if (!isset($seenFolders[$driveId]) && self::goneFromDrive($driveId)) {
                Database::run('DELETE FROM folders WHERE id = :id', ['id' => $row['id']]);
                $stats['removed']++;
            }
        }

        Database::run('UPDATE google_settings SET last_sync_at = :n WHERE id = 1', ['n' => Database::now()]);
        try {
            GoogleDrive::refreshAbout();
        } catch (DriveException) {
        }
        Activity::log('drive.sync', sprintf('Synchronised with Google Drive: %d file(s) added, %d folder(s) added, %d updated, %d removed',
            $stats['files_added'], $stats['folders_added'], $stats['updated'], $stats['removed']), 'drive');
        return $stats;
    }

    private static function goneFromDrive(string $driveId): bool
    {
        try {
            $meta = GoogleDrive::getFile($driveId, 'id,trashed');
            return !empty($meta['trashed']);
        } catch (DriveException $e) {
            return $e->reason === 'not_found';
        }
    }
}
