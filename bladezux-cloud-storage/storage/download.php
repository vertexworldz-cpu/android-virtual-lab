<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

/**
 * Streams a private Drive file to an authenticated admin.
 * Supports HTTP Range requests so video/audio can seek and downloads can resume.
 */

use Bladezux\{Activity, Auth, DriveException, Files, FileTypes, GoogleDrive, View};

Auth::requireLogin();
$id = (int) ($_GET['id'] ?? 0);
$inline = ($_GET['inline'] ?? '') === '1';
$file = $id ? Files::file($id) : null;
if (!$file) {
    View::errorPage('File not found', 'This file does not exist or was deleted.', 404);
}
$preview = FileTypes::previewKind($file['mime_type'], $file['category']);
if ($inline && $preview === null) {
    $inline = false; // never render arbitrary types inline (e.g. HTML/SVG)
}

session_write_close(); // do not lock the session during long transfers
@set_time_limit(0);
@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) {
    ob_end_clean();
}

$range = $_SERVER['HTTP_RANGE'] ?? null;
$isFirstChunk = $range === null || preg_match('/^bytes=0-/', $range);
if (!$inline && $isFirstChunk) {
    Activity::log('file.download', 'Downloaded "' . $file['name'] . '"', 'file', $file['id']);
}

$filename = $file['name'];
$ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $filename);
try {
    $status = GoogleDrive::streamMedia($file['drive_file_id'], $range, static function (int $status, array $h) use ($file, $inline, $filename, $ascii): void {
        http_response_code($status);
        header('Content-Type: ' . ($inline ? $file['mime_type'] : 'application/octet-stream'));
        header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
        header('Accept-Ranges: bytes');
        header('Cache-Control: private, no-store');
        // Chrome's PDF viewer refuses to render inside a CSP sandbox, so PDFs get a strict policy without it.
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'"
            . ($file['mime_type'] === 'application/pdf' ? '' : '; sandbox'));
        header('X-Content-Type-Options: nosniff');
        if (!empty($h['content-length'])) {
            header('Content-Length: ' . $h['content-length']);
        }
        if (!empty($h['content-range'])) {
            header('Content-Range: ' . $h['content-range']);
        }
    });
    if ($status === 416) {
        http_response_code(416);
        header('Content-Range: bytes */' . $file['size']);
    } elseif ($status !== 200 && $status !== 206 && !headers_sent()) {
        $e = GoogleDrive::errorFor($status, '');
        View::errorPage('Download failed', $e->getMessage(), $status === 404 ? 404 : 502);
    }
} catch (DriveException $e) {
    if (!headers_sent()) {
        View::errorPage('Download failed', $e->getMessage(), $e->httpStatus >= 400 && $e->httpStatus < 600 ? $e->httpStatus : 502);
    }
}
