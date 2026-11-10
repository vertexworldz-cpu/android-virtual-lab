<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Auth, FileTypes, Files, GoogleDrive, View};

$user = Auth::requireLogin();
$folderId = isset($_GET['folder']) && ctype_digit((string) $_GET['folder']) ? (int) $_GET['folder'] : null;
if ($folderId && !Files::folder($folderId)) {
    $folderId = null;
}
$type = isset($_GET['type'], FileTypes::CATEGORIES[$_GET['type']]) ? (string) $_GET['type'] : '';
$view = ($_GET['view'] ?? '') === 'recent' ? 'recent' : '';
$q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);

$active = $view === 'recent' ? 'recent' : ($type !== '' ? 'type-' . $type : 'files');
$title = match (true) {
    $q !== '' => 'Search results',
    $view === 'recent' => 'Recent uploads',
    $type !== '' => FileTypes::CATEGORIES[$type]['label'],
    default => 'My Files',
};

View::render('files', [
    'title' => $title,
    'active' => $active,
    'user' => $user,
    'currentFolder' => $folderId,
    'driveConnected' => GoogleDrive::isConnected(),
    'pageData' => [
        'folder' => $folderId,
        'type' => $type,
        'view' => $view,
        'q' => $q,
        'title' => $title,
        'categories' => array_map(static fn ($c) => $c['label'], FileTypes::CATEGORIES),
    ],
    'scripts' => ['files.js'],
]);
