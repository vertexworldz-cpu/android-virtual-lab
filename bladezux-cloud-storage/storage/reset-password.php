<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, Csrf, Database, Http, Mailer, Session, View};

$token = (string) ($_GET['token'] ?? $_POST['token'] ?? '');
$row = Auth::findToken($token, 'reset');
$state = Auth::tokenState($row);
if ($state === 'valid' && $row['status'] !== 'active') {
    $state = 'invalid';
}
$error = null;

if ($state === 'valid' && Http::isPost()) {
    Csrf::check();
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['password_confirm'] ?? '');
    $error = Auth::validatePassword($password, $confirm, $row['email'], $row['name']);
    if ($error === null) {
        $consumed = Database::transaction(static function () use ($row, $password): bool {
            // Single use: only succeeds if the token is still unused.
            $n = Database::run('UPDATE password_resets SET used_at = :n WHERE id = :id AND used_at IS NULL',
                ['n' => Database::now(), 'id' => $row['token_id']])->rowCount();
            if ($n !== 1) {
                return false;
            }
            Database::run('UPDATE admins SET password_hash = :h, password_changed_at = :n WHERE id = :id',
                ['h' => Auth::hashPassword($password), 'n' => Database::now(), 'id' => $row['admin_id']]);
            // Invalidate any other outstanding reset links.
            Database::run("UPDATE password_resets SET used_at = :n WHERE admin_id = :a AND purpose = 'reset' AND used_at IS NULL",
                ['n' => Database::now(), 'a' => $row['admin_id']]);
            return true;
        });
        if ($consumed) {
            $revoked = Auth::revokeAllSessions((int) $row['admin_id']);
            Activity::log('auth.password_reset', 'Password reset completed; ' . $revoked . ' active session(s) signed out', 'admin', $row['admin_id'], (int) $row['admin_id']);
            Mailer::securityNotice(['email' => $row['email'], 'name' => $row['name']], 'Your password was changed',
                'The password for your account was reset and all other sessions were signed out.');
            if (Auth::check()) {
                Auth::logout(null);
            }
            Session::flash('success', 'Your password has been reset. Please sign in with your new password.');
            Http::redirect('login.php');
        }
        $state = 'used';
    }
}

if ($state !== 'valid') {
    http_response_code(410);
}
View::render('auth/reset', ['title' => 'Reset password', 'state' => $state, 'token' => $token, 'error' => $error, 'row' => $row], 'auth-layout');
