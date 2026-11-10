<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Auth, Csrf, Http, View};

if (Auth::check()) {
    Http::redirect('dashboard.php');
}
if (!Auth::ownerExists()) {
    Http::redirect('signup.php');
}

$error = null;
$email = '';
if (Http::isPost()) {
    Csrf::check();
    $email = trim((string) ($_POST['email'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    if ($email === '' || $password === '') {
        $error = 'Enter your email address and password.';
    } else {
        $result = Auth::attempt($email, $password);
        if ($result['ok']) {
            $intended = (string) ($_SESSION['intended'] ?? '');
            unset($_SESSION['intended']);
            // Only allow same-app relative redirects.
            if ($intended !== '' && str_starts_with($intended, \Bladezux\App::basePath() . '/') && !str_contains($intended, '//') && !str_contains($intended, '/api/')) {
                header('Location: ' . $intended, true, 302);
                exit;
            }
            Http::redirect('dashboard.php');
        }
        $error = $result['error'];
    }
}

View::render('auth/login', ['title' => 'Sign in', 'error' => $error, 'email' => $email], 'auth-layout');
