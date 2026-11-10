<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';

/**
 * JSON API for the file manager and uploader.
 * All requests require an authenticated session; all mutations require POST + CSRF.
 */

use Bladezux\{Activity, Auth, Database, DriveException, Files, GoogleDrive, Http, Stats, Sync, Uploads};

$user = Auth::requireLogin();
$action = (string) ($_GET['action'] ?? '');

$readOnly = ['files.list', 'files.details', 'folders.tree', 'notifications', 'dashboard.stats', 'upload.config'];
if (!in_array($action, $readOnly, true)) {
    if (!Http::isPost()) {
        Http::json(['ok' => false, 'error' => 'Method not allowed.'], 405);
    }
    \Bladezux\Csrf::check();
}
// Long-running Drive calls should not block other requests from the same browser.
$in = $action === 'upload.relay' ? [] : Http::input();
if ($action !== 'notifications.seen') {
    session_write_close();
}

$requireDrive = static function (): void {
    if (!GoogleDrive::isConnected()) {
        throw new DriveException('Google Drive is disconnected. ' . (Auth::isOwner()
            ? 'Connect it in Settings → Google Drive.'
            : 'Ask the workspace owner to reconnect it.'), 503, 'disconnected');
    }
};
$ids = static fn (mixed $v): array => array_values(array_filter(array_map('intval', is_array($v) ? $v : []), static fn ($i) => $i > 0));

try {
    switch ($action) {
        case 'files.list':
            $folder = isset($_GET['folder']) && ctype_digit((string) $_GET['folder']) ? (int) $_GET['folder'] : null;
            if ($folder && !Files::folder($folder)) {
                Http::json(['ok' => false, 'error' => 'This folder no longer exists.', 'code' => 'not_found'], 404);
            }
            $data = Files::listing(
                $folder,
                mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100),
                (string) ($_GET['type'] ?? ''),
                (string) ($_GET['sort'] ?? 'name'),
                (string) ($_GET['dir'] ?? 'asc'),
                ($_GET['view'] ?? '') === 'recent'
            );
            $data['folder'] = $data['folder'] ? Files::presentFolder($data['folder']) : null;
            Http::json(['ok' => true] + $data + ['drive_connected' => GoogleDrive::isConnected()]);

        case 'files.details':
            $file = Files::file((int) ($_GET['id'] ?? 0));
            if (!$file) {
                Http::json(['ok' => false, 'error' => 'File not found.'], 404);
            }
            $out = Files::presentFile($file);
            $out['path'] = implode(' / ', array_column(Files::breadcrumb($file['folder_id'] ? (int) $file['folder_id'] : null), 'name'));
            $out['drive_file_id'] = $file['drive_file_id'];
            Http::json(['ok' => true, 'file' => $out]);

        case 'folders.tree':
            Http::json(['ok' => true, 'folders' => Files::tree()]);

        case 'folders.create':
            $requireDrive();
            $parent = !empty($in['parent_id']) ? (int) $in['parent_id'] : null;
            Http::json(['ok' => true, 'folder' => Files::createFolder($parent, (string) ($in['name'] ?? ''))]);

        case 'folders.rename':
            $requireDrive();
            Files::renameFolder((int) ($in['id'] ?? 0), (string) ($in['name'] ?? ''));
            Http::json(['ok' => true]);

        case 'folders.delete':
            $requireDrive();
            $r = Files::deleteFolder((int) ($in['id'] ?? 0));
            Http::json(['ok' => true] + $r);

        case 'files.rename':
            $requireDrive();
            Http::json(['ok' => true, 'file' => Files::renameFile((int) ($in['id'] ?? 0), (string) ($in['name'] ?? ''))]);

        case 'items.delete':
            $requireDrive();
            $result = Files::deleteFiles($ids($in['files'] ?? []));
            $folders = 0;
            foreach ($ids($in['folders'] ?? []) as $fid) {
                try {
                    Files::deleteFolder($fid);
                    $folders++;
                } catch (DriveException $e) {
                    $result['errors'][] = $e->getMessage();
                }
            }
            Http::json(['ok' => true, 'deleted' => $result['deleted'] + $folders, 'errors' => $result['errors']]);

        case 'items.move':
            $requireDrive();
            $target = !empty($in['target']) ? (int) $in['target'] : null;
            Http::json(['ok' => true] + Files::move($ids($in['files'] ?? []), $ids($in['folders'] ?? []), $target));

        case 'upload.config':
            Http::json(['ok' => true, 'connected' => GoogleDrive::isConnected()]);

        case 'upload.init':
            $requireDrive();
            Http::json(['ok' => true] + Uploads::init($in));

        case 'upload.status':
            $requireDrive();
            Http::json(['ok' => true] + Uploads::status((string) ($in['upload_id'] ?? '')));

        case 'upload.complete':
            $requireDrive();
            Http::json(['ok' => true] + Uploads::status((string) ($in['upload_id'] ?? '')));

        case 'upload.relay':
            $requireDrive();
            @set_time_limit(600);
            $uploadId = (string) ($_SERVER['HTTP_X_UPLOAD_ID'] ?? '');
            $offset = (int) ($_SERVER['HTTP_X_UPLOAD_OFFSET'] ?? -1);
            $body = (string) file_get_contents('php://input');
            Http::json(['ok' => true] + Uploads::relay($uploadId, $offset, $body));

        case 'upload.cancel':
            Uploads::cancel((string) ($in['upload_id'] ?? ''));
            Http::json(['ok' => true]);

        case 'drive.sync':
            if (!Auth::isOwner()) {
                Http::json(['ok' => false, 'error' => 'Only the owner can run a sync.'], 403);
            }
            $requireDrive();
            Http::json(['ok' => true, 'result' => Sync::run()]);

        case 'drive.refresh':
            $requireDrive();
            GoogleDrive::refreshAbout();
            Http::json(['ok' => true]);

        case 'dashboard.stats':
            Http::json(['ok' => true, 'stats' => Stats::dashboard()]);

        case 'notifications':
            $seen = $user['notifications_seen_at'] ?? null;
            $filter = Auth::isOwner() ? '' : "WHERE (l.action LIKE 'file.%' OR l.action LIKE 'folder.%' OR l.action LIKE 'drive.%' OR l.admin_id = " . (int) $user['id'] . ')';
            $rows = Database::all("SELECT l.id, l.action, l.description, l.created_at, a.name AS admin_name FROM activity_logs l
                LEFT JOIN admins a ON a.id = l.admin_id $filter ORDER BY l.id DESC LIMIT 12");
            $unreadSql = 'SELECT COUNT(*) FROM activity_logs l ' . ($filter ?: 'WHERE 1=1') . ' AND l.created_at > :s AND (l.admin_id IS NULL OR l.admin_id <> :me)';
            $unread = (int) Database::value($unreadSql, ['s' => $seen ?? '1970-01-01', 'me' => $user['id']]);
            Http::json(['ok' => true, 'unread' => $unread, 'items' => array_map(static fn ($r) => [
                'id' => (int) $r['id'],
                'icon' => Activity::icon($r['action']),
                'text' => $r['description'],
                'who' => $r['admin_name'] ?? 'System',
                'when' => time_ago($r['created_at']),
                'unread' => $seen === null || $r['created_at'] > $seen,
            ], $rows)]);

        case 'notifications.seen':
            Database::run('UPDATE admins SET notifications_seen_at = :n WHERE id = :id', ['n' => Database::now(), 'id' => $user['id']]);
            Http::json(['ok' => true]);

        default:
            Http::json(['ok' => false, 'error' => 'Unknown action.'], 404);
    }
} catch (DriveException $e) {
    $status = $e->httpStatus >= 400 && $e->httpStatus < 600 ? $e->httpStatus : 502;
    Http::json(['ok' => false, 'error' => $e->getMessage(), 'code' => $e->reason], $status);
}
