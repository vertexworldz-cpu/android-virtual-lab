<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, Csrf, Http, Session};

if (Http::isPost()) {
    Csrf::check();
    if ($user = Auth::user()) {
        Activity::log('auth.logout', $user['name'] . ' signed out', 'admin', $user['id']);
    }
    Auth::logout();
    Session::flash('success', 'You have been signed out securely.');
}
Http::redirect('login.php');
