<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, Csrf, Database, DriveException, GoogleDrive, Http, Mailer, Session, Settings, Sync, View};

$user = Auth::requireLogin();
$isOwner = Auth::isOwner();
$tabs = ['general' => 'General', 'account' => 'Account', 'drive' => 'Google Drive', 'email' => 'Email', 'security' => 'Security'];
$tab = isset($tabs[$_GET['tab'] ?? '']) ? (string) $_GET['tab'] : ($isOwner ? 'general' : 'account');
$errors = [];

$ownerOnly = static function () use ($isOwner): void {
    if (!$isOwner) {
        View::errorPage('Unauthorized access', 'Only the workspace owner can change these settings.', 403);
    }
};

if (Http::isPost()) {
    Csrf::check();
    $action = (string) ($_POST['action'] ?? '');
    try {
        switch ($action) {
            // ---------------------------------------------------------- general
            case 'general':
                $ownerOnly();
                $name = trim((string) ($_POST['app_name'] ?? ''));
                $theme = (string) ($_POST['theme'] ?? 'light');
                $tz = (string) ($_POST['timezone'] ?? 'UTC');
                if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
                    $errors[] = 'Application name must be 2–80 characters.';
                }
                if (!in_array($theme, ['light', 'dark', 'system'], true)) {
                    $errors[] = 'Invalid theme.';
                }
                if (!in_array($tz, \DateTimeZone::listIdentifiers(), true)) {
                    $errors[] = 'Invalid timezone.';
                }
                if (!$errors) {
                    Settings::set('app_name', $name);
                    Settings::set('theme', $theme);
                    Settings::set('timezone', $tz);
                    if (!empty($_FILES['logo']['tmp_name']) && is_uploaded_file($_FILES['logo']['tmp_name'])) {
                        $logo = $_FILES['logo'];
                        $info = @getimagesize($logo['tmp_name']);
                        $allowed = [IMAGETYPE_PNG => 'png', IMAGETYPE_JPEG => 'jpg', IMAGETYPE_WEBP => 'webp'];
                        if ($logo['size'] > 1024 * 1024 || !$info || !isset($allowed[$info[2]])) {
                            $errors[] = 'Logo must be a PNG, JPG or WebP image under 1 MB.';
                        } else {
                            $dir = BZX_PUBLIC_DIR . '/uploads/branding';
                            if (!is_dir($dir)) {
                                mkdir($dir, 0755, true);
                            }
                            foreach (glob($dir . '/logo-*') ?: [] as $old) {
                                @unlink($old);
                            }
                            $fname = 'logo-' . bin2hex(random_bytes(6)) . '.' . $allowed[$info[2]];
                            move_uploaded_file($logo['tmp_name'], $dir . '/' . $fname);
                            Settings::set('logo_path', 'uploads/branding/' . $fname);
                        }
                    }
                    if (!empty($_POST['remove_logo'])) {
                        foreach (glob(BZX_PUBLIC_DIR . '/uploads/branding/logo-*') ?: [] as $old) {
                            @unlink($old);
                        }
                        Settings::set('logo_path', '');
                    }
                    if (!$errors) {
                        Activity::log('settings.general', 'Updated general settings', 'settings');
                        Session::flash('success', 'General settings saved.');
                        Http::redirect('settings.php?tab=general');
                    }
                }
                break;

            case 'uploads':
                $ownerOnly();
                $maxMb = max(0, (int) ($_POST['max_upload_mb'] ?? 0));
                $chunk = (int) ($_POST['chunk_size_mb'] ?? 16);
                $policy = (string) ($_POST['duplicate_policy'] ?? 'ask');
                $blocked = strtolower(preg_replace('/[^a-z0-9,]/i', '', str_replace([' ', '.'], '', (string) ($_POST['blocked_extensions'] ?? ''))) ?? '');
                $mandatory = ['php', 'phtml', 'phar', 'htaccess', 'exe', 'sh'];
                $list = array_unique(array_filter(array_merge(explode(',', $blocked), $mandatory)));
                if (!in_array($chunk, [4, 8, 16, 32, 64, 128], true)) {
                    $errors[] = 'Choose a valid chunk size.';
                }
                if (!in_array($policy, ['ask', 'rename', 'replace'], true)) {
                    $errors[] = 'Choose a valid duplicate policy.';
                }
                if (!$errors) {
                    Settings::set('max_upload_bytes', (string) ($maxMb * 1024 * 1024));
                    Settings::set('chunk_size_mb', (string) $chunk);
                    Settings::set('duplicate_policy', $policy);
                    Settings::set('blocked_extensions', implode(',', $list));
                    Activity::log('settings.uploads', 'Updated upload rules', 'settings');
                    Session::flash('success', 'Upload settings saved.');
                    Http::redirect('settings.php?tab=general');
                }
                break;

            // ---------------------------------------------------------- account
            case 'profile':
                $name = trim((string) ($_POST['name'] ?? ''));
                $email = strtolower(trim((string) ($_POST['email'] ?? '')));
                if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
                    $errors[] = 'Please enter your full name (2–120 characters).';
                }
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = 'Please enter a valid email address.';
                }
                if ($email !== $user['email']) {
                    $hash = Database::value('SELECT password_hash FROM admins WHERE id = :id', ['id' => $user['id']]);
                    if (!password_verify((string) ($_POST['current_password'] ?? ''), (string) $hash)) {
                        $errors[] = 'Enter your current password to change your email address.';
                    } elseif (Database::value('SELECT id FROM admins WHERE email = :e AND id <> :id', ['e' => $email, 'id' => $user['id']])) {
                        $errors[] = 'That email address is already used by another account.';
                    }
                }
                if (!$errors) {
                    Database::run('UPDATE admins SET name = :n, email = :e WHERE id = :id', ['n' => $name, 'e' => $email, 'id' => $user['id']]);
                    if ($email !== $user['email']) {
                        Mailer::securityNotice($user, 'Your sign-in email was changed', 'The sign-in email for your account was changed to ' . $email . '.');
                    }
                    Activity::log('admin.profile', 'Updated profile', 'admin', $user['id']);
                    Session::flash('success', 'Profile updated.');
                    Http::redirect('settings.php?tab=account');
                }
                break;

            case 'password':
                $current = (string) ($_POST['current_password'] ?? '');
                $new = (string) ($_POST['password'] ?? '');
                $confirm = (string) ($_POST['password_confirm'] ?? '');
                $hash = Database::value('SELECT password_hash FROM admins WHERE id = :id', ['id' => $user['id']]);
                if (!password_verify($current, (string) $hash)) {
                    $errors[] = 'Your current password is incorrect.';
                } elseif ($e = Auth::validatePassword($new, $confirm, $user['email'], $user['name'])) {
                    $errors[] = $e;
                } elseif (password_verify($new, (string) $hash)) {
                    $errors[] = 'The new password must be different from the current one.';
                }
                if (!$errors) {
                    Database::run('UPDATE admins SET password_hash = :h, password_changed_at = :n WHERE id = :id',
                        ['h' => Auth::hashPassword($new), 'n' => Database::now(), 'id' => $user['id']]);
                    $revoked = Auth::revokeAllSessions((int) $user['id'], (int) $user['session_row_id']);
                    \Bladezux\Session::regenerate();
                    Database::run('UPDATE login_sessions SET session_hash = :h WHERE id = :id', ['h' => \Bladezux\Crypto::hash(session_id()), 'id' => $user['session_row_id']]);
                    Activity::log('auth.password_changed', 'Changed password; ' . $revoked . ' other session(s) signed out', 'admin', $user['id']);
                    Mailer::securityNotice($user, 'Your password was changed', 'The password for your account was changed. Other active sessions were signed out.');
                    Session::flash('success', 'Password changed. Other sessions have been signed out.');
                    Http::redirect('settings.php?tab=account');
                }
                break;

            // ------------------------------------------------------------ drive
            case 'drive_credentials':
                $ownerOnly();
                $clientId = trim((string) ($_POST['client_id'] ?? ''));
                $secret = trim((string) ($_POST['client_secret'] ?? ''));
                $scope = ($_POST['scope'] ?? '') === 'full' ? GoogleDrive::SCOPE_FULL : GoogleDrive::SCOPE_FILE;
                if (!preg_match('/^[A-Za-z0-9\-_.]+$/', $clientId) || strlen($clientId) > 255) {
                    $errors[] = 'Enter a valid OAuth client ID (ends with .apps.googleusercontent.com).';
                }
                if ($secret === '' && !GoogleDrive::hasCredentials()) {
                    $errors[] = 'Enter the OAuth client secret.';
                }
                if (!$errors) {
                    GoogleDrive::saveCredentials($clientId, $secret, $scope);
                    Activity::log('drive.credentials', 'Updated Google OAuth credentials', 'drive');
                    Session::flash('success', 'Google OAuth credentials saved. Click "Connect Google Drive" to authorise.');
                    Http::redirect('settings.php?tab=drive');
                }
                break;

            case 'drive_connect':
                $ownerOnly();
                header('Location: ' . GoogleDrive::authorizationUrl(), true, 302);
                exit;

            case 'drive_disconnect':
                $ownerOnly();
                GoogleDrive::disconnect();
                Activity::log('drive.disconnected', 'Disconnected Google Drive', 'drive');
                Session::flash('success', 'Google Drive disconnected. Files remain in Google Drive; reconnect the same account to continue.');
                Http::redirect('settings.php?tab=drive');

            case 'drive_refresh':
                GoogleDrive::refreshAbout();
                Session::flash('success', 'Storage information refreshed.');
                Http::redirect('settings.php?tab=drive');

            case 'drive_sync':
                $ownerOnly();
                $r = Sync::run();
                Session::flash('success', sprintf('Sync complete: %d file(s) added, %d folder(s) added, %d updated, %d removed.', $r['files_added'], $r['folders_added'], $r['updated'], $r['removed']));
                Http::redirect('settings.php?tab=drive');

            // ------------------------------------------------------------ email
            case 'smtp':
                $ownerOnly();
                $host = trim((string) ($_POST['smtp_host'] ?? ''));
                $port = (int) ($_POST['smtp_port'] ?? 0);
                $enc = (string) ($_POST['smtp_encryption'] ?? 'ssl');
                $username = trim((string) ($_POST['smtp_username'] ?? ''));
                $password = (string) ($_POST['smtp_password'] ?? '');
                $fromEmail = strtolower(trim((string) ($_POST['smtp_from_email'] ?? '')));
                $fromName = trim((string) ($_POST['smtp_from_name'] ?? ''));
                if ($host === '' || !preg_match('/^[a-z0-9.\-]+$/i', $host)) {
                    $errors[] = 'Enter a valid SMTP host (e.g. mail.yourdomain.com).';
                }
                if ($port < 1 || $port > 65535) {
                    $errors[] = 'Enter a valid SMTP port (465 for SSL, 587 for STARTTLS).';
                }
                if (!in_array($enc, ['ssl', 'tls', 'none'], true)) {
                    $errors[] = 'Choose an encryption method.';
                }
                if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = 'Enter a valid sender email.';
                }
                if (!$errors) {
                    Settings::set('smtp_host', $host);
                    Settings::set('smtp_port', (string) $port);
                    Settings::set('smtp_encryption', $enc);
                    Settings::set('smtp_username', $username);
                    if ($password !== '') {
                        Settings::set('smtp_password', $password, true);
                    }
                    Settings::set('smtp_from_email', $fromEmail);
                    Settings::set('smtp_from_name', $fromName !== '' ? mb_substr($fromName, 0, 100) : Settings::appName());
                    Activity::log('settings.smtp', 'Updated SMTP settings', 'settings');
                    Session::flash('success', 'SMTP settings saved. Send a test email to verify delivery.');
                    Http::redirect('settings.php?tab=email');
                }
                break;

            case 'smtp_test':
                $ownerOnly();
                $to = strtolower(trim((string) ($_POST['test_email'] ?? $user['email'])));
                if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
                    $errors[] = 'Enter a valid recipient address.';
                    break;
                }
                $r = Mailer::test($to, $user['name']);
                Activity::log('settings.smtp_test', 'Sent SMTP test email to ' . $to . ($r['ok'] ? '' : ' (failed)'), 'settings');
                Session::flash($r['ok'] ? 'success' : 'error', $r['ok'] ? 'Test email sent to ' . $to . '. Check the inbox (and spam folder).' : 'SMTP connection failure: ' . $r['error']);
                Http::redirect('settings.php?tab=email');

            // --------------------------------------------------------- security
            case 'revoke_session':
                $sid = (int) ($_POST['session_id'] ?? 0);
                $where = $isOwner ? 'id = :id' : 'id = :id AND admin_id = :a';
                $params = $isOwner ? ['id' => $sid] : ['id' => $sid, 'a' => $user['id']];
                Database::run("UPDATE login_sessions SET revoked_at = :n WHERE $where AND revoked_at IS NULL", $params + ['n' => Database::now()]);
                Activity::log('auth.session_revoked', 'Revoked a login session', 'session', $sid);
                Session::flash('success', 'Session signed out.');
                Http::redirect('settings.php?tab=security');

            case 'revoke_others':
                $n = Auth::revokeAllSessions((int) $user['id'], (int) $user['session_row_id']);
                Activity::log('auth.session_revoked', 'Signed out ' . $n . ' other session(s)', 'admin', $user['id']);
                Session::flash('success', $n . ' other session(s) signed out.');
                Http::redirect('settings.php?tab=security');

            default:
                $errors[] = 'Unknown action.';
        }
    } catch (DriveException $e) {
        $errors[] = $e->getMessage();
    }
}

// --------------------------------------------------------------- view data
$data = [
    'title' => 'Settings',
    'active' => 'settings',
    'user' => $user,
    'tabs' => $tabs,
    'tab' => $tab,
    'isOwner' => $isOwner,
    'errors' => $errors,
    'scripts' => ['settings.js'],
];
if ($tab === 'drive') {
    $data['drive'] = GoogleDrive::settings(true);
    $data['redirectUri'] = GoogleDrive::redirectUri();
    $data['driveStats'] = Database::one('SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS bytes FROM files');
}
if ($tab === 'security') {
    $sessWhere = $isOwner ? '' : 'WHERE s.admin_id = :a';
    $sessParams = $isOwner ? [] : ['a' => $user['id']];
    $data['sessions'] = Database::all("SELECT s.*, a.name AS admin_name FROM login_sessions s JOIN admins a ON a.id = s.admin_id
        $sessWhere " . ($sessWhere ? 'AND' : 'WHERE') . " s.revoked_at IS NULL AND s.last_activity_at > :cut ORDER BY s.last_activity_at DESC LIMIT 50",
        $sessParams + ['cut' => Database::now(-\Bladezux\Session::ABSOLUTE_TIMEOUT)]);
    $data['logins'] = Database::all('SELECT la.*, a.name AS admin_name FROM login_attempts la LEFT JOIN admins a ON a.id = la.admin_id'
        . ($isOwner ? '' : ' WHERE la.admin_id = :a') . ' ORDER BY la.id DESC LIMIT 30', $isOwner ? [] : ['a' => $user['id']]);
    $data['activity'] = \Bladezux\Stats::recentActivity(15, (int) $user['id']);
}
if ($tab === 'general') {
    $data['timezones'] = \DateTimeZone::listIdentifiers();
    $data['limits'] = [
        'upload_max_filesize' => ini_get('upload_max_filesize'),
        'post_max_size' => ini_get('post_max_size'),
        'memory_limit' => ini_get('memory_limit'),
        'max_execution_time' => ini_get('max_execution_time'),
        'relay_chunk' => format_bytes(\Bladezux\Uploads::relayChunkSize()),
    ];
}
View::render('settings', $data);
