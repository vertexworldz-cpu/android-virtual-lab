<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

/**
 * Sign-up is never open to the public:
 *  - Initial owner setup requires the one-time setup key from config.php.
 *  - Afterwards, accounts are only created through owner invitations.
 */

use Bladezux\{Activity, App, Auth, Csrf, Database, Http, Mailer, Session, View};

$ownerExists = Auth::ownerExists();
$inviteToken = (string) ($_GET['invite'] ?? $_POST['invite'] ?? '');
$invite = null;
$mode = 'closed';

if (!$ownerExists) {
    $mode = 'owner';
} elseif ($inviteToken !== '') {
    $invite = Auth::findToken($inviteToken, 'invite');
    $state = Auth::tokenState($invite);
    if ($state === 'valid' && $invite['status'] === 'pending') {
        $mode = 'invite';
    } else {
        $mode = 'invite_invalid';
    }
}

if (Auth::check() && in_array($mode, ['closed', 'owner'], true)) {
    Http::redirect('dashboard.php');
}

$errors = [];
$old = ['name' => '', 'email' => ''];

if (Http::isPost() && in_array($mode, ['owner', 'invite'], true)) {
    Csrf::check();
    $name = trim((string) ($_POST['name'] ?? ''));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['password_confirm'] ?? '');
    $old = ['name' => $name, 'email' => $email];

    if (!\Bladezux\RateLimiter::hit('signup', \Bladezux\Http::ip(), 10, 3600)) {
        $errors[] = 'Too many attempts. Please wait and try again later.';
    }
    if ($mode === 'invite') {
        $email = $invite['email'];
    }
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
        $errors[] = 'Please enter your full name (2–120 characters).';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
        $errors[] = 'Please enter a valid email address.';
    }
    if ($e = Auth::validatePassword($password, $confirm, $email, $name)) {
        $errors[] = $e;
    }
    if ($mode === 'owner') {
        $setupKey = (string) App::config('app.setup_key', '');
        if ($setupKey === '' || !hash_equals($setupKey, trim((string) ($_POST['setup_key'] ?? '')))) {
            $errors[] = 'The setup key is incorrect. You can find it in your private config.php file.';
        }
    }

    if (!$errors) {
        if ($mode === 'owner') {
            $created = Database::transaction(static function () use ($name, $email, $password) {
                // Re-check inside the transaction to avoid two owners racing.
                if ((int) Database::value("SELECT COUNT(*) FROM admins WHERE role = 'owner' FOR UPDATE") > 0) {
                    return null;
                }
                if (Database::value('SELECT id FROM admins WHERE email = :e', ['e' => $email])) {
                    return null;
                }
                return Database::insert(
                    "INSERT INTO admins (name, email, password_hash, role, status, password_changed_at) VALUES (:n, :e, :h, 'owner', 'active', :t)",
                    ['n' => $name, 'e' => $email, 'h' => Auth::hashPassword($password), 't' => Database::now()]
                );
            });
            if ($created) {
                Auth::loginAs((int) $created);
                Activity::log('admin.owner_created', 'Workspace owner account created for ' . $email, 'admin', $created);
                Session::flash('success', 'Welcome! Your owner account is ready. Next, connect Google Drive and configure email.');
                Http::redirect('settings.php?tab=drive');
            }
            $errors[] = 'An owner account already exists. Please sign in.';
        } else {
            Database::transaction(static function () use ($invite, $name, $password) {
                Database::run("UPDATE admins SET name = :n, password_hash = :h, status = 'active', password_changed_at = :t WHERE id = :id",
                    ['n' => $name, 'h' => Auth::hashPassword($password), 't' => Database::now(), 'id' => $invite['admin_id']]);
                Database::run('UPDATE password_resets SET used_at = :n WHERE id = :id', ['n' => Database::now(), 'id' => $invite['token_id']]);
            });
            if (Auth::check()) {
                Auth::logout(null);
            }
            Auth::loginAs((int) $invite['admin_id']);
            Activity::log('admin.activated', $name . ' activated their administrator account', 'admin', $invite['admin_id']);
            Session::flash('success', 'Your account is active. Welcome to ' . \Bladezux\Settings::appName() . '!');
            Http::redirect('dashboard.php');
        }
    }
}

View::render('auth/signup', [
    'title' => $mode === 'owner' ? 'Set up owner account' : 'Create account',
    'mode' => $mode,
    'invite' => $invite,
    'inviteToken' => $inviteToken,
    'errors' => $errors,
    'old' => $old,
], 'auth-layout');
