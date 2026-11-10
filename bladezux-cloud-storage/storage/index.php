<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Auth, Http};

Http::redirect(Auth::check() ? 'dashboard.php' : 'login.php');
