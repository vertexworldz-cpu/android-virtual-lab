<?php
declare(strict_types=1);

namespace Bladezux;

/**
 * Application kernel: configuration discovery, error handling,
 * HTTPS enforcement, security headers and session start-up.
 */
final class App
{
    private static array $config = [];
    private static ?string $privateDir = null;
    private static bool $booted = false;

    public static function boot(): void
    {
        if (self::$booted) {
            return;
        }
        self::$booted = true;

        ini_set('display_errors', '0');
        ini_set('log_errors', '1');
        error_reporting(E_ALL);

        self::$privateDir = self::locatePrivateDir();
        $installer = defined('BZX_INSTALLER');

        if (self::$privateDir !== null && is_file(self::$privateDir . '/config.php')) {
            $config = require self::$privateDir . '/config.php';
            self::$config = is_array($config) ? $config : [];
        } elseif (!$installer) {
            // Not installed yet: send the visitor to the installer.
            header('Location: ' . self::guessBasePath() . '/install/');
            exit;
        }

        Logger::init(self::logDir());
        set_exception_handler([self::class, 'handleException']);
        set_error_handler(static function (int $no, string $str, string $file, int $line): bool {
            if (!(error_reporting() & $no)) {
                return false;
            }
            Logger::error("PHP error [$no] $str in $file:$line");
            return true;
        });

        date_default_timezone_set('UTC');

        if ($installer) {
            return;
        }

        self::enforceHttps();
        self::sendSecurityHeaders();
        Session::start();

        try {
            $tz = Settings::get('timezone', 'UTC');
            if (in_array($tz, \DateTimeZone::listIdentifiers(), true)) {
                date_default_timezone_set($tz);
            }
        } catch (\Throwable) {
            // Database errors surface later with a friendly page.
        }
    }

    /**
     * Private directory (holds config.php and logs). Searched outside the
     * web root first so secrets never sit inside public_html.
     */
    public static function locatePrivateDir(): ?string
    {
        $candidates = [];
        $env = getenv('BLADEZUX_PRIVATE_DIR');
        if ($env) {
            $candidates[] = $env;
        }
        // /home/USER/public_html/storage/app -> /home/USER/bladezux-private
        $candidates[] = dirname(BZX_APP_DIR, 3) . '/bladezux-private';
        // Fallback inside the protected app directory (denied by .htaccess)
        $candidates[] = BZX_APP_DIR . '/private';

        foreach ($candidates as $dir) {
            if (is_file(rtrim($dir, '/') . '/config.php')) {
                return rtrim($dir, '/');
            }
        }
        return null;
    }

    public static function privateDir(): ?string
    {
        return self::$privateDir;
    }

    public static function logDir(): string
    {
        $dir = self::$config['paths']['logs'] ?? (self::$privateDir ? self::$privateDir . '/logs' : BZX_APP_DIR . '/private/logs');
        return rtrim((string) $dir, '/');
    }

    public static function config(string $path, mixed $default = null): mixed
    {
        $value = self::$config;
        foreach (explode('.', $path) as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }
            $value = $value[$segment];
        }
        return $value;
    }

    public static function isInstalled(): bool
    {
        return self::$config !== [];
    }

    /** Absolute base URL without trailing slash, e.g. https://example.com/storage */
    public static function baseUrl(): string
    {
        $configured = (string) self::config('app.base_url', '');
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        $scheme = self::isHttps() ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return $scheme . '://' . $host . self::guessBasePath();
    }

    public static function basePath(): string
    {
        $path = parse_url(self::baseUrl(), PHP_URL_PATH) ?: '';
        return rtrim($path, '/');
    }

    public static function origin(): string
    {
        $parts = parse_url(self::baseUrl());
        $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? 'localhost');
        if (!empty($parts['port'])) {
            $origin .= ':' . $parts['port'];
        }
        return $origin;
    }

    private static function guessBasePath(): string
    {
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $docRoot = str_replace('\\', '/', (string) realpath($_SERVER['DOCUMENT_ROOT'] ?? ''));
        $public = str_replace('\\', '/', (string) realpath(BZX_PUBLIC_DIR));
        if ($docRoot !== '' && str_starts_with($public, $docRoot)) {
            return rtrim(substr($public, strlen($docRoot)), '/');
        }
        $dir = dirname($script);
        foreach (['/api', '/install'] as $suffix) {
            if (str_ends_with($dir, $suffix)) {
                $dir = substr($dir, 0, -strlen($suffix));
            }
        }
        return rtrim($dir, '/');
    }

    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
            return true;
        }
        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
            return true;
        }
        if (self::config('app.trust_proxy', false)) {
            return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
        }
        return false;
    }

    private static function enforceHttps(): void
    {
        if (!self::config('app.force_https', true) || PHP_SAPI === 'cli') {
            return;
        }
        if (!self::isHttps()) {
            $host = parse_url(self::baseUrl(), PHP_URL_HOST) ?: ($_SERVER['HTTP_HOST'] ?? '');
            header('Location: https://' . $host . ($_SERVER['REQUEST_URI'] ?? '/'), true, 301);
            exit;
        }
        header('Strict-Transport-Security: max-age=31536000');
    }

    public static function originOf(string $url): string
    {
        $p = parse_url($url);
        if (empty($p['host'])) {
            return '';
        }
        return ($p['scheme'] ?? 'https') . '://' . $p['host'] . (!empty($p['port']) ? ':' . $p['port'] : '');
    }

    private static function sendSecurityHeaders(): void
    {
        $uploadOrigin = self::originOf((string) GoogleDrive::endpoint('upload_url'));
        $authOrigin = self::originOf((string) GoogleDrive::endpoint('auth_url'));
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: same-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            . "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self' $uploadOrigin; "
            . "frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' $authOrigin; frame-ancestors 'self'");
    }

    public static function handleException(\Throwable $e): void
    {
        $ref = strtoupper(bin2hex(random_bytes(4)));
        Logger::error("[$ref] " . get_class($e) . ': ' . $e->getMessage() . "\n" . $e->getTraceAsString());
        if (!headers_sent()) {
            http_response_code(500);
        }
        $isDb = $e instanceof \PDOException;
        $message = $isDb
            ? 'The database is currently unavailable. Please try again shortly.'
            : 'An unexpected error occurred. Please try again.';
        if (Http::wantsJson()) {
            if (!headers_sent()) {
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode(['ok' => false, 'error' => $message, 'reference' => $ref]);
            return;
        }
        View::errorPage($isDb ? 'Database connection failure' : 'Something went wrong', $message . ' Reference: ' . $ref, 500);
    }
}
