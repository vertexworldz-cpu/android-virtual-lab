<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

/** Proxies the private Drive thumbnail for a file (images, video, PDF). */

use Bladezux\{Auth, Database, DriveException, Files, GoogleDrive};

Auth::requireLogin();
session_write_close();
$file = Files::file((int) ($_GET['id'] ?? 0));
if (!$file || !(int) $file['has_thumbnail']) {
    http_response_code(404);
    exit;
}
try {
    $meta = GoogleDrive::getFile($file['drive_file_id'], 'thumbnailLink,hasThumbnail');
    if (empty($meta['thumbnailLink'])) {
        Database::run('UPDATE files SET has_thumbnail = 0 WHERE id = :id', ['id' => $file['id']]);
        http_response_code(404);
        exit;
    }
    // Request a larger rendition than the default 220px.
    $link = preg_replace('/=s\d+$/', '=s480', $meta['thumbnailLink']);
    $thumb = GoogleDrive::fetchThumbnail($link);
    if (!$thumb || !preg_match('#^image/(jpeg|png|webp|gif)#', $thumb['type'])) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . $thumb['type']);
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    echo $thumb['body'];
} catch (DriveException) {
    http_response_code(404);
}
