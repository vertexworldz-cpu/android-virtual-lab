<?php
declare(strict_types=1);

namespace Bladezux;

/**
 * Resumable upload orchestration.
 *
 * Flow: browser -> init (PHP validates + opens a Drive resumable session)
 *       browser -> PUT chunks directly to Google (or via relay() fallback)
 *       browser -> complete (PHP verifies with Google and records metadata)
 */
final class Uploads
{
    public const SESSION_TTL = 6 * 86400; // Google keeps sessions for ~7 days

    public static function iniBytes(string $key): int
    {
        $v = trim((string) ini_get($key));
        if ($v === '' || $v === '-1' || $v === '0') {
            return PHP_INT_MAX;
        }
        $unit = strtolower(substr($v, -1));
        $n = (int) $v;
        return match ($unit) {
            'g' => $n * 1024 ** 3,
            'm' => $n * 1024 ** 2,
            'k' => $n * 1024,
            default => $n,
        };
    }

    /** Largest chunk the relay endpoint can accept given post_max_size. */
    public static function relayChunkSize(): int
    {
        $limit = min(self::iniBytes('post_max_size'), self::iniBytes('memory_limit') / 3) - 65536;
        $quantum = 256 * 1024;
        $size = (int) (floor($limit / $quantum) * $quantum);
        return max($quantum, min(Settings::chunkSize(), $size, 32 * 1024 * 1024));
    }

    public static function find(string $publicId): array
    {
        $row = Database::one('SELECT * FROM upload_sessions WHERE public_id = :p AND admin_id = :a', ['p' => $publicId, 'a' => Auth::id()]);
        if (!$row) {
            throw new DriveException('Upload session not found.', 404, 'not_found');
        }
        return $row;
    }

    public static function init(array $in): array
    {
        $folderId = !empty($in['folder_id']) ? (int) $in['folder_id'] : null;
        $folder = Files::requireFolder($folderId);
        $name = FileTypes::sanitizeName((string) ($in['name'] ?? ''));
        $size = (int) ($in['size'] ?? 0);
        $head = base64_decode((string) ($in['head'] ?? ''), true) ?: '';
        $head = substr($head, 0, 8192);

        if ($error = FileTypes::validateUpload($name, $size, $head)) {
            throw new DriveException($error, 422, 'invalid_file');
        }

        // The stored MIME type drives inline previews, so it is derived from the extension.
        // The browser-supplied type is only used for unknown extensions, and never for
        // active content types.
        $ext = FileTypes::extension($name);
        $mime = FileTypes::mimeFromExtension($ext);
        $clientMime = strtolower((string) ($in['mime'] ?? ''));
        if ($mime === 'application/octet-stream' && preg_match('#^[a-z0-9.+-]+/[a-z0-9.+-]+$#', $clientMime)
            && !preg_match('#(html|javascript|ecmascript|xml|svg|php|x-sh)#', $clientMime)) {
            $mime = $clientMime;
        }

        $fingerprint = hash('sha256', implode('|', [Auth::id(), $folderId ?? 0, $name, $size, (string) ($in['last_modified'] ?? '')]));

        // Resume an unfinished session for the same file (e.g. after a page reload).
        $existing = Database::one(
            "SELECT * FROM upload_sessions WHERE admin_id = :a AND fingerprint = :f AND status IN ('pending','uploading')
              AND expires_at > :n ORDER BY id DESC LIMIT 1",
            ['a' => Auth::id(), 'f' => $fingerprint, 'n' => Database::now()]
        );
        if ($existing) {
            $uri = Crypto::decrypt($existing['session_uri_enc']);
            if ($uri) {
                $state = GoogleDrive::querySession($uri, (int) $existing['file_size']);
                if ($state['state'] === 'complete') {
                    $file = self::finalize($existing, $state['file'] ?? []);
                    return ['complete' => true, 'file' => $file];
                }
                if ($state['state'] === 'incomplete') {
                    return self::sessionPayload($existing, $uri, $state['offset'], true);
                }
            }
            Database::run("UPDATE upload_sessions SET status = 'failed', error_message = 'Session expired' WHERE id = :id", ['id' => $existing['id']]);
        }

        // Duplicate filename handling.
        $policy = (string) ($in['conflict'] ?? Settings::get('duplicate_policy', 'ask'));
        if (!in_array($policy, ['ask', 'rename', 'replace', 'skip'], true)) {
            $policy = 'ask';
        }
        $replaceId = null;
        $dupId = Files::fileNameExists($folderId, $name);
        if ($dupId) {
            if ($policy === 'ask') {
                $dup = Files::file($dupId);
                return ['conflict' => true, 'existing' => ['id' => $dupId, 'name' => $dup['name'], 'size_h' => format_bytes((int) $dup['size']), 'created' => local_time($dup['created_at'])]];
            }
            if ($policy === 'skip') {
                return ['skipped' => true];
            }
            if ($policy === 'rename') {
                $name = Files::uniqueFileName($folderId, $name);
            } else {
                $replaceId = $dupId;
            }
        }

        self::checkQuota($size);

        $parent = $folder ? $folder['drive_folder_id'] : GoogleDrive::rootFolderId();
        $uri = GoogleDrive::createResumableSession($name, $mime, $size, $parent);
        $publicId = bin2hex(random_bytes(16));
        $id = Database::insert(
            'INSERT INTO upload_sessions (public_id, admin_id, folder_id, file_name, file_size, mime_type, fingerprint, session_uri_enc, replace_file_id, expires_at)
             VALUES (:p, :a, :f, :n, :s, :m, :fp, :u, :r, :x)',
            ['p' => $publicId, 'a' => Auth::id(), 'f' => $folderId, 'n' => $name, 's' => $size, 'm' => $mime,
             'fp' => $fingerprint, 'u' => Crypto::encrypt($uri), 'r' => $replaceId, 'x' => Database::now(self::SESSION_TTL)]
        );
        $row = Database::one('SELECT * FROM upload_sessions WHERE id = :id', ['id' => $id]);
        return self::sessionPayload($row, $uri, 0, false);
    }

    private static function sessionPayload(array $row, string $uri, int $offset, bool $resumed): array
    {
        return [
            'upload_id' => $row['public_id'],
            'name' => $row['file_name'],
            // Single-file, short-lived upload capability. Never the OAuth token.
            'session_uri' => $uri,
            'offset' => $offset,
            'chunk_size' => Settings::chunkSize(),
            'relay_chunk_size' => self::relayChunkSize(),
            'resumed' => $resumed,
        ];
    }

    private static function checkQuota(int $size): void
    {
        $s = GoogleDrive::settings();
        if (empty($s['quota_updated_at']) || strtotime($s['quota_updated_at'] . ' UTC') < time() - 600) {
            try {
                GoogleDrive::refreshAbout();
                $s = GoogleDrive::settings(true);
            } catch (DriveException $e) {
                if ($e->reason === 'disconnected' || $e->reason === 'invalid_grant') {
                    throw $e;
                }
            }
        }
        if (!empty($s['quota_limit']) && (int) $s['quota_usage'] + $size > (int) $s['quota_limit']) {
            throw new DriveException(
                'Upload quota exceeded: this file needs ' . format_bytes($size) . ' but only '
                . format_bytes(max(0, (int) $s['quota_limit'] - (int) $s['quota_usage'])) . ' is free in Google Drive.',
                507,
                'quota_exceeded'
            );
        }
    }

    /** Server-verified status: asks Google for the persisted byte offset. */
    public static function status(string $publicId): array
    {
        $row = self::find($publicId);
        if ($row['status'] === 'completed') {
            $file = Database::one('SELECT * FROM files WHERE drive_file_id = :d', ['d' => $row['drive_file_id']]);
            return ['complete' => true, 'file' => $file ? Files::presentFile($file + ['uploader_name' => null, 'folder_name' => null]) : null];
        }
        if ($row['status'] === 'cancelled') {
            throw new DriveException('This upload was cancelled.', 410, 'cancelled');
        }
        $uri = Crypto::decrypt($row['session_uri_enc']) ?? '';
        $state = GoogleDrive::querySession($uri, (int) $row['file_size']);
        if ($state['state'] === 'complete') {
            return ['complete' => true, 'file' => self::finalize($row, $state['file'] ?? [])];
        }
        if ($state['state'] === 'expired') {
            Database::run("UPDATE upload_sessions SET status = 'failed', error_message = 'Session expired' WHERE id = :id", ['id' => $row['id']]);
            throw new DriveException('The upload session expired. Please upload the file again.', 410, 'expired');
        }
        Database::run("UPDATE upload_sessions SET bytes_uploaded = :b, status = 'uploading' WHERE id = :id", ['b' => $state['offset'], 'id' => $row['id']]);
        return ['complete' => false, 'offset' => $state['offset']];
    }

    /** Fallback path: browser posts a raw chunk, PHP forwards it to the Drive session. */
    public static function relay(string $publicId, int $offset, string $data): array
    {
        $row = self::find($publicId);
        if (!in_array($row['status'], ['pending', 'uploading'], true)) {
            throw new DriveException('This upload is no longer active.', 410, 'inactive');
        }
        $total = (int) $row['file_size'];
        $len = strlen($data);
        if ($len === 0 || $offset < 0 || $offset + $len > $total || ($offset + $len < $total && $len % (256 * 1024) !== 0)) {
            throw new DriveException('Invalid chunk boundaries.', 400, 'bad_chunk');
        }
        $uri = Crypto::decrypt($row['session_uri_enc']) ?? '';
        $state = GoogleDrive::putChunk($uri, $data, $offset, $total);
        if ($state['state'] === 'complete') {
            return ['complete' => true, 'file' => self::finalize($row, $state['file'] ?? [])];
        }
        if ($state['state'] === 'expired') {
            throw new DriveException('The upload session expired. Please upload the file again.', 410, 'expired');
        }
        Database::run("UPDATE upload_sessions SET bytes_uploaded = :b, status = 'uploading' WHERE id = :id", ['b' => $state['offset'], 'id' => $row['id']]);
        return ['complete' => false, 'offset' => $state['offset']];
    }

    public static function cancel(string $publicId): void
    {
        $row = self::find($publicId);
        if (in_array($row['status'], ['pending', 'uploading', 'failed'], true)) {
            $uri = Crypto::decrypt($row['session_uri_enc']);
            if ($uri) {
                GoogleDrive::cancelSession($uri);
            }
            Database::run("UPDATE upload_sessions SET status = 'cancelled' WHERE id = :id", ['id' => $row['id']]);
        }
    }

    /** Verifies the uploaded Drive file and records it in MySQL. */
    private static function finalize(array $row, array $drive): array
    {
        $fresh = Database::one('SELECT status, drive_file_id FROM upload_sessions WHERE id = :id', ['id' => $row['id']]);
        if ($fresh && $fresh['status'] === 'completed' && $fresh['drive_file_id']) {
            $done = Database::value('SELECT id FROM files WHERE drive_file_id = :d', ['d' => $fresh['drive_file_id']]);
            if ($done) {
                return Files::presentFile(Files::file((int) $done));
            }
        }
        if (empty($drive['id'])) {
            throw new DriveException('Google Drive did not confirm the upload. Please retry.', 502, 'unconfirmed');
        }
        // Re-read authoritative metadata from Drive (size, parents, thumbnail).
        $meta = GoogleDrive::getFile($drive['id']);
        $expectedParent = $row['folder_id'] ? (Files::folder((int) $row['folder_id'])['drive_folder_id'] ?? '') : GoogleDrive::rootFolderId();
        if ((int) ($meta['size'] ?? -1) !== (int) $row['file_size'] || !in_array($expectedParent, $meta['parents'] ?? [], true)) {
            Logger::warning('Upload verification mismatch for session ' . $row['public_id']);
            throw new DriveException('The uploaded file could not be verified. Please upload it again.', 502, 'verify_failed');
        }
        $fileId = Database::transaction(static function () use ($row, $meta): int {
            $id = Files::record($meta, $row['folder_id'] ? (int) $row['folder_id'] : null, (int) $row['admin_id']);
            Database::run("UPDATE upload_sessions SET status = 'completed', bytes_uploaded = file_size, drive_file_id = :d WHERE id = :id",
                ['d' => $meta['id'], 'id' => $row['id']]);
            return $id;
        });
        if ($row['replace_file_id'] && (int) $row['replace_file_id'] !== $fileId) {
            $old = Files::file((int) $row['replace_file_id']);
            if ($old) {
                GoogleDrive::trash($old['drive_file_id']);
                Database::run('DELETE FROM files WHERE id = :id', ['id' => $old['id']]);
                Activity::log('file.replace', 'Replaced "' . $old['name'] . '" with a new version', 'file', $fileId);
            }
        }
        Activity::log('file.upload', 'Uploaded "' . $meta['name'] . '" (' . format_bytes((int) $row['file_size']) . ')', 'file', $fileId);
        return Files::presentFile(Files::file($fileId));
    }

    public static function cleanup(): void
    {
        Database::run("UPDATE upload_sessions SET status = 'failed', error_message = 'Expired' WHERE status IN ('pending','uploading') AND expires_at < :n", ['n' => Database::now()]);
        Database::run("DELETE FROM upload_sessions WHERE status IN ('completed','cancelled','failed') AND updated_at < :n", ['n' => Database::now(-30 * 86400)]);
    }
}
