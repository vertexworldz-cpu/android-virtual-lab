<?php
declare(strict_types=1);

namespace Bladezux;

/**
 * File and folder operations. Every mutation is applied to Google Drive first
 * and then mirrored to MySQL so both stay consistent.
 */
final class Files
{
    public const SORTS = ['name' => 'name', 'date' => 'created_at', 'size' => 'size', 'type' => 'extension'];

    // ---------------------------------------------------------------- lookups

    public static function folder(?int $id): ?array
    {
        return $id ? Database::one('SELECT * FROM folders WHERE id = :id', ['id' => $id]) : null;
    }

    public static function file(int $id): ?array
    {
        return Database::one('SELECT f.*, a.name AS uploader_name, fo.name AS folder_name
                                FROM files f LEFT JOIN admins a ON a.id = f.uploaded_by
                                LEFT JOIN folders fo ON fo.id = f.folder_id WHERE f.id = :id', ['id' => $id]);
    }

    public static function requireFolder(?int $id): ?array
    {
        if (!$id) {
            return null;
        }
        $folder = self::folder($id);
        if (!$folder) {
            throw new DriveException('The folder no longer exists.', 404, 'not_found');
        }
        return $folder;
    }

    public static function driveParentId(?int $folderId): string
    {
        $folder = self::requireFolder($folderId);
        return $folder ? $folder['drive_folder_id'] : GoogleDrive::rootFolderId();
    }

    /** @return array<int, array{id:?int, name:string}> */
    public static function breadcrumb(?int $folderId): array
    {
        $trail = [];
        $guard = 0;
        while ($folderId && $guard++ < 64) {
            $f = self::folder($folderId);
            if (!$f) {
                break;
            }
            array_unshift($trail, ['id' => (int) $f['id'], 'name' => $f['name']]);
            $folderId = $f['parent_id'] ? (int) $f['parent_id'] : null;
        }
        array_unshift($trail, ['id' => null, 'name' => 'My Files']);
        return $trail;
    }

    public static function fileNameExists(?int $folderId, string $name, int $excludeId = 0): ?int
    {
        $id = Database::value(
            'SELECT id FROM files WHERE ' . ($folderId ? 'folder_id = :f' : 'folder_id IS NULL') . ' AND LOWER(name) = LOWER(:n) AND id <> :x LIMIT 1',
            array_filter(['f' => $folderId, 'n' => $name, 'x' => $excludeId], static fn ($v) => $v !== null)
        );
        return $id ? (int) $id : null;
    }

    public static function folderNameExists(?int $parentId, string $name, int $excludeId = 0): bool
    {
        return (bool) Database::value(
            'SELECT id FROM folders WHERE ' . ($parentId ? 'parent_id = :p' : 'parent_id IS NULL') . ' AND LOWER(name) = LOWER(:n) AND id <> :x LIMIT 1',
            array_filter(['p' => $parentId, 'n' => $name, 'x' => $excludeId], static fn ($v) => $v !== null)
        );
    }

    /** "report.pdf" -> "report (1).pdf" until unique within the folder. */
    public static function uniqueFileName(?int $folderId, string $name): string
    {
        if (!self::fileNameExists($folderId, $name)) {
            return $name;
        }
        $ext = FileTypes::extension($name);
        $base = $ext !== '' ? mb_substr($name, 0, -(strlen($ext) + 1)) : $name;
        $base = preg_replace('/ \(\d+\)$/', '', $base) ?? $base;
        for ($i = 1; $i < 1000; $i++) {
            $candidate = $base . " ($i)" . ($ext !== '' ? ".$ext" : '');
            if (!self::fileNameExists($folderId, $candidate)) {
                return $candidate;
            }
        }
        return $base . ' (' . bin2hex(random_bytes(3)) . ')' . ($ext !== '' ? ".$ext" : '');
    }

    // ---------------------------------------------------------------- listing

    public static function listing(?int $folderId, string $search, string $category, string $sort, string $dir, bool $recent = false): array
    {
        $sortCol = self::SORTS[$sort] ?? 'name';
        $direction = strtolower($dir) === 'desc' ? 'DESC' : 'ASC';
        $global = $search !== '' || $category !== '' || $recent;

        $where = [];
        $params = [];
        if (!$global) {
            $where[] = $folderId ? 'f.folder_id = :folder' : 'f.folder_id IS NULL';
            if ($folderId) {
                $params['folder'] = $folderId;
            }
        }
        if ($search !== '') {
            $where[] = 'f.name LIKE :q';
            $params['q'] = '%' . addcslashes($search, '%_\\') . '%';
        }
        if ($category !== '' && isset(FileTypes::CATEGORIES[$category])) {
            $where[] = 'f.category = :cat';
            $params['cat'] = $category;
        }
        $order = $recent ? 'f.created_at DESC' : "f.$sortCol $direction, f.name ASC";
        $limit = $recent ? 'LIMIT 100' : 'LIMIT 5000';
        $files = Database::all(
            'SELECT f.*, a.name AS uploader_name, fo.name AS folder_name FROM files f
               LEFT JOIN admins a ON a.id = f.uploaded_by LEFT JOIN folders fo ON fo.id = f.folder_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order $limit",
            $params
        );

        $folders = [];
        if (!$global || $search !== '') {
            $fWhere = [];
            $fParams = [];
            if (!$global) {
                $fWhere[] = $folderId ? 'fo.parent_id = :folder' : 'fo.parent_id IS NULL';
                if ($folderId) {
                    $fParams['folder'] = $folderId;
                }
            }
            if ($search !== '') {
                $fWhere[] = 'fo.name LIKE :q';
                $fParams['q'] = $params['q'];
            }
            $fSort = in_array($sortCol, ['created_at'], true) ? "fo.created_at $direction" : 'fo.name ' . ($sortCol === 'name' ? $direction : 'ASC');
            $folders = Database::all(
                'SELECT fo.*, (SELECT COUNT(*) FROM files x WHERE x.folder_id = fo.id) AS file_count,
                        (SELECT COUNT(*) FROM folders y WHERE y.parent_id = fo.id) AS folder_count,
                        (SELECT COALESCE(SUM(size),0) FROM files z WHERE z.folder_id = fo.id) AS total_size
                   FROM folders fo' . ($fWhere ? ' WHERE ' . implode(' AND ', $fWhere) : '') . " ORDER BY $fSort",
                $fParams
            );
        }

        return [
            'folder' => $folderId ? self::folder($folderId) : null,
            'breadcrumb' => self::breadcrumb($global ? null : $folderId),
            'folders' => array_map([self::class, 'presentFolder'], $folders),
            'files' => array_map([self::class, 'presentFile'], $files),
            'global' => $global,
        ];
    }

    public static function presentFile(array $f): array
    {
        $preview = FileTypes::previewKind($f['mime_type'], $f['category']);
        return [
            'id' => (int) $f['id'],
            'name' => $f['name'],
            'extension' => $f['extension'],
            'mime' => $f['mime_type'],
            'category' => $f['category'],
            'icon' => FileTypes::iconFor($f['category']),
            'size' => (int) $f['size'],
            'size_h' => format_bytes((int) $f['size']),
            'created' => local_time($f['created_at']),
            'created_short' => local_time($f['created_at'], 'M j, Y'),
            'updated' => local_time($f['updated_at']),
            'uploader' => $f['uploader_name'] ?? '—',
            'folder_id' => $f['folder_id'] ? (int) $f['folder_id'] : null,
            'folder_name' => $f['folder_name'] ?? 'My Files',
            'thumb' => (int) $f['has_thumbnail'] === 1,
            'preview' => $preview,
            'md5' => $f['md5_checksum'],
        ];
    }

    public static function presentFolder(array $f): array
    {
        return [
            'id' => (int) $f['id'],
            'name' => $f['name'],
            'parent_id' => $f['parent_id'] ? (int) $f['parent_id'] : null,
            'file_count' => (int) ($f['file_count'] ?? 0),
            'folder_count' => (int) ($f['folder_count'] ?? 0),
            'size_h' => format_bytes((int) ($f['total_size'] ?? 0)),
            'created_short' => local_time($f['created_at'], 'M j, Y'),
        ];
    }

    /** Flat folder tree for the "Move to" dialog. */
    public static function tree(): array
    {
        $rows = Database::all('SELECT id, parent_id, name FROM folders ORDER BY name');
        $children = [];
        foreach ($rows as $r) {
            $children[(int) ($r['parent_id'] ?? 0)][] = $r;
        }
        $out = [];
        $walk = static function (int $parent, int $depth) use (&$walk, &$out, $children): void {
            foreach ($children[$parent] ?? [] as $r) {
                $out[] = ['id' => (int) $r['id'], 'name' => $r['name'], 'depth' => $depth, 'parent_id' => $r['parent_id'] ? (int) $r['parent_id'] : null];
                if ($depth < 30) {
                    $walk((int) $r['id'], $depth + 1);
                }
            }
        };
        $walk(0, 1);
        return $out;
    }

    /** IDs of a folder and all its descendants. */
    public static function descendantIds(int $folderId): array
    {
        $ids = [$folderId];
        $queue = [$folderId];
        while ($queue) {
            $current = array_shift($queue);
            foreach (Database::all('SELECT id FROM folders WHERE parent_id = :p', ['p' => $current]) as $r) {
                $ids[] = (int) $r['id'];
                $queue[] = (int) $r['id'];
            }
        }
        return $ids;
    }

    // -------------------------------------------------------------- mutations

    public static function createFolder(?int $parentId, string $name): array
    {
        $name = FileTypes::sanitizeName($name);
        if ($name === '') {
            throw new DriveException('Please enter a valid folder name.', 422, 'invalid');
        }
        if (self::folderNameExists($parentId, $name)) {
            throw new DriveException('A folder with this name already exists here.', 409, 'exists');
        }
        $driveParent = self::driveParentId($parentId);
        $drive = GoogleDrive::createFolder($name, $driveParent);
        $id = Database::insert(
            'INSERT INTO folders (parent_id, name, drive_folder_id, created_by) VALUES (:p, :n, :d, :a)',
            ['p' => $parentId, 'n' => $name, 'd' => $drive['id'], 'a' => Auth::id()]
        );
        Activity::log('folder.create', 'Created folder "' . $name . '"', 'folder', $id);
        return self::presentFolder(self::folder($id));
    }

    public static function renameFolder(int $id, string $name): void
    {
        $folder = self::requireFolder($id);
        $name = FileTypes::sanitizeName($name);
        if ($name === '') {
            throw new DriveException('Please enter a valid folder name.', 422, 'invalid');
        }
        if (self::folderNameExists($folder['parent_id'] ? (int) $folder['parent_id'] : null, $name, $id)) {
            throw new DriveException('A folder with this name already exists here.', 409, 'exists');
        }
        GoogleDrive::rename($folder['drive_folder_id'], $name);
        Database::run('UPDATE folders SET name = :n WHERE id = :id', ['n' => $name, 'id' => $id]);
        Activity::log('folder.rename', 'Renamed folder "' . $folder['name'] . '" to "' . $name . '"', 'folder', $id);
    }

    public static function deleteFolder(int $id): array
    {
        $folder = self::requireFolder($id);
        $ids = self::descendantIds($id);
        $in = implode(',', array_map('intval', $ids));
        $stats = Database::one("SELECT COUNT(*) AS c, COALESCE(SUM(size),0) AS s FROM files WHERE folder_id IN ($in)");
        GoogleDrive::trash($folder['drive_folder_id']); // trashes contents recursively in Drive
        Database::run('DELETE FROM folders WHERE id = :id', ['id' => $id]); // cascades to sub-folders + files
        Activity::log('folder.delete', sprintf('Deleted folder "%s" (%d file(s), %s)', $folder['name'], (int) $stats['c'], format_bytes((int) $stats['s'])), 'folder', $id);
        return ['files' => (int) $stats['c']];
    }

    public static function renameFile(int $id, string $name): array
    {
        $file = self::file($id) ?? throw new DriveException('The file no longer exists.', 404, 'not_found');
        $name = FileTypes::sanitizeName($name);
        if ($name === '') {
            throw new DriveException('Please enter a valid file name.', 422, 'invalid');
        }
        $newExt = FileTypes::extension($name);
        foreach (explode('.', strtolower($name)) as $i => $part) {
            if ($i > 0 && in_array($part, Settings::blockedExtensions(), true)) {
                throw new DriveException('Files of type ".' . $part . '" are not allowed.', 422, 'blocked');
            }
        }
        if (self::fileNameExists($file['folder_id'] ? (int) $file['folder_id'] : null, $name, $id)) {
            throw new DriveException('A file with this name already exists in this folder.', 409, 'exists');
        }
        GoogleDrive::rename($file['drive_file_id'], $name);
        Database::run('UPDATE files SET name = :n, extension = :e, category = :c WHERE id = :id', [
            'n' => $name, 'e' => $newExt, 'c' => FileTypes::category($name, $file['mime_type']), 'id' => $id,
        ]);
        Activity::log('file.rename', 'Renamed "' . $file['name'] . '" to "' . $name . '"', 'file', $id);
        return self::presentFile(self::file($id));
    }

    /** @param int[] $ids */
    public static function deleteFiles(array $ids): array
    {
        $deleted = 0;
        $errors = [];
        foreach (array_unique(array_map('intval', $ids)) as $id) {
            $file = self::file($id);
            if (!$file) {
                continue;
            }
            try {
                GoogleDrive::trash($file['drive_file_id']);
                Database::run('DELETE FROM files WHERE id = :id', ['id' => $id]);
                Activity::log('file.delete', 'Deleted "' . $file['name'] . '" (' . format_bytes((int) $file['size']) . ')', 'file', $id);
                $deleted++;
            } catch (DriveException $e) {
                $errors[] = $file['name'] . ': ' . $e->getMessage();
            }
        }
        return ['deleted' => $deleted, 'errors' => $errors];
    }

    /** Moves files and/or folders into $targetId (null = root). */
    public static function move(array $fileIds, array $folderIds, ?int $targetId): array
    {
        $target = self::requireFolder($targetId);
        $targetDrive = $target ? $target['drive_folder_id'] : GoogleDrive::rootFolderId();
        $moved = 0;
        $errors = [];

        foreach (array_unique(array_map('intval', $folderIds)) as $fid) {
            $folder = self::folder($fid);
            if (!$folder) {
                continue;
            }
            if ($targetId && in_array($targetId, self::descendantIds($fid), true)) {
                $errors[] = $folder['name'] . ': a folder cannot be moved into itself.';
                continue;
            }
            if ((int) ($folder['parent_id'] ?? 0) === (int) ($targetId ?? 0)) {
                continue;
            }
            if (self::folderNameExists($targetId, $folder['name'], $fid)) {
                $errors[] = $folder['name'] . ': a folder with this name already exists in the destination.';
                continue;
            }
            try {
                $oldParent = self::driveParentId($folder['parent_id'] ? (int) $folder['parent_id'] : null);
                GoogleDrive::move($folder['drive_folder_id'], $targetDrive, $oldParent);
                Database::run('UPDATE folders SET parent_id = :p WHERE id = :id', ['p' => $targetId, 'id' => $fid]);
                Activity::log('folder.move', 'Moved folder "' . $folder['name'] . '" to "' . ($target['name'] ?? 'My Files') . '"', 'folder', $fid);
                $moved++;
            } catch (DriveException $e) {
                $errors[] = $folder['name'] . ': ' . $e->getMessage();
            }
        }

        foreach (array_unique(array_map('intval', $fileIds)) as $id) {
            $file = self::file($id);
            if (!$file || (int) ($file['folder_id'] ?? 0) === (int) ($targetId ?? 0)) {
                continue;
            }
            try {
                $newName = self::uniqueFileName($targetId, $file['name']);
                $oldParent = self::driveParentId($file['folder_id'] ? (int) $file['folder_id'] : null);
                GoogleDrive::move($file['drive_file_id'], $targetDrive, $oldParent);
                if ($newName !== $file['name']) {
                    GoogleDrive::rename($file['drive_file_id'], $newName);
                }
                Database::run('UPDATE files SET folder_id = :f, name = :n WHERE id = :id', ['f' => $targetId, 'n' => $newName, 'id' => $id]);
                Activity::log('file.move', 'Moved "' . $file['name'] . '" to "' . ($target['name'] ?? 'My Files') . '"', 'file', $id);
                $moved++;
            } catch (DriveException $e) {
                $errors[] = $file['name'] . ': ' . $e->getMessage();
            }
        }
        return ['moved' => $moved, 'errors' => $errors];
    }

    /** Records a Drive file in MySQL (after upload or during sync). */
    public static function record(array $drive, ?int $folderId, ?int $uploadedBy): int
    {
        $name = (string) $drive['name'];
        $mime = (string) ($drive['mimeType'] ?? 'application/octet-stream');
        $existing = Database::value('SELECT id FROM files WHERE drive_file_id = :d', ['d' => $drive['id']]);
        $params = [
            'folder' => $folderId,
            'name' => $name,
            'ext' => FileTypes::extension($name),
            'mime' => mb_substr($mime, 0, 190),
            'cat' => FileTypes::category($name, $mime),
            'size' => (int) ($drive['size'] ?? 0),
            'md5' => $drive['md5Checksum'] ?? null,
            'thumb' => !empty($drive['hasThumbnail']) ? 1 : 0,
        ];
        if ($existing) {
            Database::run('UPDATE files SET folder_id = :folder, name = :name, extension = :ext, mime_type = :mime, category = :cat,
                           size = :size, md5_checksum = :md5, has_thumbnail = :thumb WHERE id = :id', $params + ['id' => (int) $existing]);
            return (int) $existing;
        }
        $created = isset($drive['createdTime']) ? gmdate('Y-m-d H:i:s', strtotime($drive['createdTime'])) : Database::now();
        return Database::insert(
            'INSERT INTO files (folder_id, name, extension, mime_type, category, size, drive_file_id, md5_checksum, has_thumbnail, uploaded_by, created_at)
             VALUES (:folder, :name, :ext, :mime, :cat, :size, :drive, :md5, :thumb, :by, :created)',
            $params + ['drive' => $drive['id'], 'by' => $uploadedBy, 'created' => $created]
        );
    }
}
