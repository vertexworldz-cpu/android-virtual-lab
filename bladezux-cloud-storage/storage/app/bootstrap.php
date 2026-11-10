<?php
/**
 * Bladezux Cloud Storage — application bootstrap.
 * Every public entry point includes this file first.
 */
declare(strict_types=1);

if (PHP_VERSION_ID < 80200) {
    http_response_code(500);
    exit('Bladezux Cloud Storage requires PHP 8.2 or newer.');
}

define('BZX_APP_DIR', __DIR__);
define('BZX_PUBLIC_DIR', dirname(__DIR__));
define('BZX_VERSION', '1.0.0');

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Bladezux\\')) {
        $file = BZX_APP_DIR . '/lib/' . str_replace('\\', '/', substr($class, 9)) . '.php';
        if (is_file($file)) {
            require $file;
        }
        return;
    }
    if (str_starts_with($class, 'PHPMailer\\PHPMailer\\')) {
        $file = BZX_APP_DIR . '/vendor/phpmailer/' . substr($class, 20) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

require BZX_APP_DIR . '/lib/helpers.php';

use Bladezux\App;

App::boot();
