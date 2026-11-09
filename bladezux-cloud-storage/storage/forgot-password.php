<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, Csrf, Database, Http, Mailer, RateLimiter, View};

$sent = false;
$error = null;

if (Http::isPost()) {
    Csrf::check();
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'Please enter a valid email address.';
    } elseif (!RateLimiter::hit('reset-ip', Http::ip(), 10, 3600) || !RateLimiter::hit('reset-email', $email, 3, 3600)) {
        $error = 'Too many reset requests. Please wait an hour before trying again.';
    } else {
        $admin = Database::one("SELECT id, name, email, status FROM admins WHERE email = :e AND status = 'active'", ['e' => $email]);
        if ($admin) {
            $token = Auth::createToken((int) $admin['id'], 'reset', 1800);
            $link = url('reset-password.php?token=' . urlencode($token), true);
            $result = Mailer::passwordReset($admin, $link);
            Activity::log('auth.reset_requested', 'Password reset requested for ' . $email . ($result['ok'] ? '' : ' (email delivery failed)'), 'admin', $admin['id'], (int) $admin['id']);
            if (!$result['ok']) {
                $error = 'We could not send the reset email right now: ' . $result['error'];
            }
        }
        // Same response whether or not the account exists (no user enumeration).
        $sent = $error === null;
    }
}

View::render('auth/forgot', ['title' => 'Forgot password', 'sent' => $sent, 'error' => $error], 'auth-layout');
