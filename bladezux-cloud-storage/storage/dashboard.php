<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Auth, GoogleDrive, Stats, View};

$user = Auth::requireLogin();
$stats = Stats::dashboard();

View::render('dashboard', [
    'title' => 'Dashboard',
    'active' => 'dashboard',
    'user' => $user,
    'stats' => $stats,
    'recent' => Stats::recentUploads(6),
    'activity' => Stats::recentActivity(8, Auth::isOwner() ? null : (int) $user['id']),
    'drive' => GoogleDrive::settings(),
    'pageData' => ['categories' => $stats['categories'], 'daily' => $stats['daily'], 'storage' => [
        'app' => $stats['app_bytes'], 'usage' => $stats['drive_usage'], 'limit' => $stats['drive_limit'],
    ]],
    'scripts' => ['dashboard.js'],
]);
