<?php
declare(strict_types=1);

namespace Bladezux;

/** Sliding-window rate limiting backed by MySQL. */
final class RateLimiter
{
    public const LOGIN_MAX_PER_ACCOUNT = 5;
    public const LOGIN_MAX_PER_IP = 20;
    public const LOGIN_WINDOW = 900; // 15 minutes

    /** Returns seconds the caller must wait, or 0 if the login attempt may proceed. */
    public static function loginLockout(string $email, string $ip): int
    {
        $since = Database::now(-self::LOGIN_WINDOW);
        $emailHash = Crypto::hash(strtolower(trim($email)));
        $byAccount = (int) Database::value(
            'SELECT COUNT(*) FROM login_attempts WHERE email_hash = :h AND success = 0 AND created_at > :s',
            ['h' => $emailHash, 's' => $since]
        );
        $byIp = (int) Database::value(
            'SELECT COUNT(*) FROM login_attempts WHERE ip_address = :ip AND success = 0 AND created_at > :s',
            ['ip' => $ip, 's' => $since]
        );
        if ($byAccount < self::LOGIN_MAX_PER_ACCOUNT && $byIp < self::LOGIN_MAX_PER_IP) {
            return 0;
        }
        $oldest = Database::value(
            'SELECT MIN(created_at) FROM (SELECT created_at FROM login_attempts
              WHERE (email_hash = :h OR ip_address = :ip) AND success = 0 AND created_at > :s
              ORDER BY created_at DESC LIMIT 20) t',
            ['h' => $emailHash, 'ip' => $ip, 's' => $since]
        );
        $wait = $oldest ? (strtotime($oldest . ' UTC') + self::LOGIN_WINDOW) - time() : self::LOGIN_WINDOW;
        return max(60, $wait);
    }

    public static function recordLogin(string $email, string $ip, bool $success, ?int $adminId): void
    {
        Database::run(
            'INSERT INTO login_attempts (admin_id, email_hash, ip_address, user_agent, success) VALUES (:a, :h, :ip, :ua, :s)',
            ['a' => $adminId, 'h' => Crypto::hash(strtolower(trim($email))), 'ip' => $ip, 'ua' => Http::userAgent(), 's' => $success ? 1 : 0]
        );
        if ($success) {
            // A successful login clears the failure counter for that account.
            Database::run('DELETE FROM login_attempts WHERE email_hash = :h AND success = 0', ['h' => Crypto::hash(strtolower(trim($email)))]);
        }
    }

    /** Generic limiter: returns true if allowed (and records the hit). */
    public static function hit(string $bucket, string $key, int $max, int $windowSeconds): bool
    {
        $hash = Crypto::hash($key);
        $count = (int) Database::value(
            'SELECT COUNT(*) FROM rate_limits WHERE bucket = :b AND key_hash = :k AND created_at > :s',
            ['b' => $bucket, 'k' => $hash, 's' => Database::now(-$windowSeconds)]
        );
        if ($count >= $max) {
            return false;
        }
        Database::run('INSERT INTO rate_limits (bucket, key_hash) VALUES (:b, :k)', ['b' => $bucket, 'k' => $hash]);
        if (random_int(1, 50) === 1) {
            Database::run('DELETE FROM rate_limits WHERE created_at < :s', ['s' => Database::now(-86400)]);
        }
        return true;
    }
}
