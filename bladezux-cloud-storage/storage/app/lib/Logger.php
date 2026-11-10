<?php
declare(strict_types=1);

namespace Bladezux;

/** Minimal file logger. Never logs secrets (callers must redact). */
final class Logger
{
    private static string $dir = '';

    public static function init(string $dir): void
    {
        self::$dir = $dir;
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        if (is_dir($dir) && is_writable($dir)) {
            ini_set('error_log', $dir . '/php-error.log');
            if (!is_file($dir . '/.htaccess')) {
                @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
            }
        }
    }

    public static function error(string $message): void
    {
        self::write('ERROR', $message);
    }

    public static function warning(string $message): void
    {
        self::write('WARN', $message);
    }

    public static function info(string $message): void
    {
        self::write('INFO', $message);
    }

    private static function write(string $level, string $message): void
    {
        // Redact anything that looks like a bearer token or upload session URI.
        $message = preg_replace('/(Bearer\s+)[A-Za-z0-9._\-]+/', '$1[redacted]', $message) ?? $message;
        $message = preg_replace('/(upload_id=)[A-Za-z0-9._\-]+/', '$1[redacted]', $message) ?? $message;
        $line = sprintf("[%s] %s %s\n", gmdate('Y-m-d H:i:s'), $level, $message);
        if (self::$dir !== '' && is_writable(self::$dir)) {
            @file_put_contents(self::$dir . '/app-' . gmdate('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);
        } else {
            error_log(trim($line));
        }
    }
}
