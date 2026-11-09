<?php
declare(strict_types=1);

namespace Bladezux;

/** Synchroniser-token CSRF protection for forms and AJAX requests. */
final class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['_csrf'])) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf'];
    }

    public static function field(): string
    {
        return '<input type="hidden" name="_csrf" value="' . e(self::token()) . '">';
    }

    public static function valid(?string $token): bool
    {
        return is_string($token) && !empty($_SESSION['_csrf']) && hash_equals($_SESSION['_csrf'], $token);
    }

    /** Validate the token from a form field or the X-CSRF-Token header. */
    public static function check(): void
    {
        $token = $_POST['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
        if (!self::valid($token)) {
            if (Http::wantsJson()) {
                Http::json(['ok' => false, 'error' => 'Your session has expired. Please refresh the page and try again.'], 419);
            }
            View::errorPage('Session expired', 'Your security token has expired. Please go back, refresh the page and try again.', 419);
        }
    }
}
