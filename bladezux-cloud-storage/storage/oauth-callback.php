<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, DriveException, GoogleDrive, Http, Logger, Session};

Auth::requireOwner();

if (isset($_GET['error'])) {
    unset($_SESSION['oauth']);
    $err = (string) $_GET['error'];
    Session::flash('error', $err === 'access_denied'
        ? 'Google Drive authorization was cancelled. No changes were made.'
        : 'Google returned an authorization error. Please try connecting again.');
    Activity::log('drive.oauth_failed', 'Google authorization failed: ' . mb_substr(preg_replace('/[^a-z_]/i', '', $err), 0, 40), 'drive');
    Http::redirect('settings.php?tab=drive');
}

try {
    GoogleDrive::handleCallback((string) ($_GET['code'] ?? ''), (string) ($_GET['state'] ?? ''));
    $s = GoogleDrive::settings(true);
    Activity::log('drive.connected', 'Connected Google Drive account ' . ($s['account_email'] ?? ''), 'drive');
    Session::flash('success', 'Google Drive connected successfully' . (!empty($s['account_email']) ? ' as ' . $s['account_email'] : '') . '.');
} catch (DriveException $e) {
    Session::flash('error', $e->getMessage());
    Activity::log('drive.oauth_failed', 'Google Drive connection failed: ' . $e->getMessage(), 'drive');
} catch (\Throwable $e) {
    Logger::error('OAuth callback error: ' . $e->getMessage());
    Session::flash('error', 'OAuth authorization failure. Please try again.');
}
Http::redirect('settings.php?tab=drive');
