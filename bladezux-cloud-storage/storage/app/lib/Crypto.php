<?php
declare(strict_types=1);

namespace Bladezux;

/** AES-256-GCM encryption for secrets at rest (OAuth tokens, SMTP password). */
final class Crypto
{
    private static function key(): string
    {
        $raw = (string) App::config('app.key', '');
        $key = base64_decode($raw, true);
        if ($key === false || strlen($key) !== 32) {
            throw new \RuntimeException('Application key (app.key) is missing or invalid in config.php');
        }
        return $key;
    }

    public static function encrypt(?string $plain): ?string
    {
        if ($plain === null || $plain === '') {
            return null;
        }
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, 'bzx', 16);
        if ($cipher === false) {
            throw new \RuntimeException('Encryption failed');
        }
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $payload): ?string
    {
        if ($payload === null || $payload === '' || !str_starts_with($payload, 'v1:')) {
            return null;
        }
        $raw = base64_decode(substr($payload, 3), true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), 'bzx');
        return $plain === false ? null : $plain;
    }

    public static function token(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public static function hash(string $value): string
    {
        return hash('sha256', $value);
    }
}
