<?php
declare(strict_types=1);

namespace Bladezux;

/** Authentication, session tracking and authorisation middleware. */
final class Auth
{
    private static ?array $user = null;
    private static bool $resolved = false;

    public const MIN_PASSWORD_LENGTH = 10;

    /**
     * @return array{ok:bool, error?:string}
     */
    public static function attempt(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        $ip = Http::ip();
        $wait = RateLimiter::loginLockout($email, $ip);
        if ($wait > 0) {
            return ['ok' => false, 'error' => sprintf('Too many failed sign-in attempts. Please try again in %d minute(s).', (int) ceil($wait / 60))];
        }

        $admin = Database::one('SELECT * FROM admins WHERE email = :e LIMIT 1', ['e' => $email]);
        // Always run password_verify to keep timing consistent for unknown accounts.
        $hash = $admin['password_hash'] ?? '$2y$10$T.vRexSotOfV0A1ha63Vo.n3TKks73rqb63ED0suqKyPPbkdHUA4q';
        $valid = password_verify($password, (string) $hash);

        if (!$admin || !$valid || $admin['password_hash'] === null) {
            RateLimiter::recordLogin($email, $ip, false, $admin['id'] ?? null);
            if ($admin) {
                Activity::log('auth.failed', 'Failed sign-in attempt for ' . $email, 'admin', $admin['id'], (int) $admin['id']);
            }
            return ['ok' => false, 'error' => 'The email or password you entered is incorrect.'];
        }
        if ($admin['status'] !== 'active') {
            RateLimiter::recordLogin($email, $ip, false, (int) $admin['id']);
            return ['ok' => false, 'error' => 'This account is disabled. Please contact the workspace owner.'];
        }

        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            Database::run('UPDATE admins SET password_hash = :h WHERE id = :id', ['h' => password_hash($password, PASSWORD_DEFAULT), 'id' => $admin['id']]);
        }

        RateLimiter::recordLogin($email, $ip, true, (int) $admin['id']);
        self::loginAs((int) $admin['id']);
        Activity::log('auth.login', $admin['name'] . ' signed in', 'admin', $admin['id']);
        return ['ok' => true];
    }

    public static function loginAs(int $adminId): void
    {
        Session::regenerate();
        $_SESSION['admin_id'] = $adminId;
        $_SESSION['login_at'] = time();
        $_SESSION['last_seen'] = time();
        unset($_SESSION['_csrf']);
        Database::run(
            'INSERT INTO login_sessions (admin_id, session_hash, ip_address, user_agent) VALUES (:a, :h, :ip, :ua)',
            ['a' => $adminId, 'h' => Crypto::hash(Session::id()), 'ip' => Http::ip(), 'ua' => Http::userAgent()]
        );
        Database::run('UPDATE admins SET last_login_at = :n, last_login_ip = :ip WHERE id = :id', ['n' => Database::now(), 'ip' => Http::ip(), 'id' => $adminId]);
        self::$resolved = false;
        self::$user = null;
    }

    public static function user(): ?array
    {
        if (self::$resolved) {
            return self::$user;
        }
        self::$resolved = true;
        $id = (int) ($_SESSION['admin_id'] ?? 0);
        if ($id <= 0) {
            return null;
        }
        $now = time();
        if ($now - (int) ($_SESSION['last_seen'] ?? 0) > Session::IDLE_TIMEOUT
            || $now - (int) ($_SESSION['login_at'] ?? 0) > Session::ABSOLUTE_TIMEOUT) {
            self::logout('Session expired');
            return null;
        }
        $session = Database::one(
            'SELECT id, last_activity_at FROM login_sessions WHERE session_hash = :h AND admin_id = :a AND revoked_at IS NULL',
            ['h' => Crypto::hash(Session::id()), 'a' => $id]
        );
        $admin = Database::one("SELECT id, name, email, role, status, last_login_at, password_changed_at, notifications_seen_at, created_at FROM admins WHERE id = :id", ['id' => $id]);
        if (!$session || !$admin || $admin['status'] !== 'active') {
            self::logout(null);
            return null;
        }
        $_SESSION['last_seen'] = $now;
        if ($now - strtotime($session['last_activity_at'] . ' UTC') > 60) {
            Database::run('UPDATE login_sessions SET last_activity_at = :n WHERE id = :id', ['n' => Database::now(), 'id' => $session['id']]);
        }
        $admin['session_row_id'] = (int) $session['id'];
        self::$user = $admin;
        return $admin;
    }

    public static function id(): ?int
    {
        $u = self::$resolved ? self::$user : (isset($_SESSION['admin_id']) ? self::user() : null);
        return $u ? (int) $u['id'] : null;
    }

    public static function check(): bool
    {
        return self::user() !== null;
    }

    public static function isOwner(): bool
    {
        return (self::user()['role'] ?? '') === 'owner';
    }

    public static function requireLogin(): array
    {
        $user = self::user();
        if ($user === null) {
            if (Http::wantsJson()) {
                Http::json(['ok' => false, 'error' => 'Your session has ended. Please sign in again.', 'code' => 'unauthenticated'], 401);
            }
            $_SESSION['intended'] = $_SERVER['REQUEST_URI'] ?? null;
            Http::redirect('login.php');
        }
        return $user;
    }

    public static function requireOwner(): array
    {
        $user = self::requireLogin();
        if ($user['role'] !== 'owner') {
            if (Http::wantsJson()) {
                Http::json(['ok' => false, 'error' => 'Only the workspace owner can perform this action.', 'code' => 'forbidden'], 403);
            }
            View::errorPage('Unauthorized access', 'Only the workspace owner can access this page.', 403);
        }
        return $user;
    }

    public static function logout(?string $reason = 'Signed out'): void
    {
        if (session_status() === PHP_SESSION_ACTIVE && Session::id() !== '') {
            Database::run('UPDATE login_sessions SET revoked_at = :n WHERE session_hash = :h AND revoked_at IS NULL', ['n' => Database::now(), 'h' => Crypto::hash(Session::id())]);
        }
        self::$user = null;
        self::$resolved = true;
        Session::destroy();
        Session::start();
        if ($reason === 'Session expired') {
            Session::flash('info', 'Your session expired. Please sign in again.');
        }
    }

    /** Revoke every session for an admin (e.g. after a password reset). */
    public static function revokeAllSessions(int $adminId, ?int $exceptSessionRowId = null): int
    {
        return Database::run(
            'UPDATE login_sessions SET revoked_at = :n WHERE admin_id = :a AND revoked_at IS NULL AND id <> :ex',
            ['n' => Database::now(), 'a' => $adminId, 'ex' => $exceptSessionRowId ?? 0]
        )->rowCount();
    }

    /** @return string|null error message, or null when the password is acceptable */
    public static function validatePassword(string $password, string $confirm, string $email = '', string $name = ''): ?string
    {
        if (mb_strlen($password) < self::MIN_PASSWORD_LENGTH) {
            return 'Password must be at least ' . self::MIN_PASSWORD_LENGTH . ' characters long.';
        }
        if (strlen($password) > 72) {
            return 'Password must be 72 characters or fewer.';
        }
        if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
            return 'Password must contain at least one letter and one number.';
        }
        if ($password !== $confirm) {
            return 'Password confirmation does not match.';
        }
        $lower = strtolower($password);
        if ($email !== '' && str_contains($lower, strtolower(strtok($email, '@')))) {
            return 'Password must not contain your email address.';
        }
        return null;
    }

    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /** Creates a single-use token (reset or invite). Returns the raw token for the email link. */
    public static function createToken(int $adminId, string $purpose, int $ttlSeconds): string
    {
        // Only one live token per purpose: older ones are invalidated.
        Database::run(
            'UPDATE password_resets SET used_at = :n WHERE admin_id = :a AND purpose = :p AND used_at IS NULL',
            ['n' => Database::now(), 'a' => $adminId, 'p' => $purpose]
        );
        $token = Crypto::token(32);
        Database::run(
            'INSERT INTO password_resets (admin_id, token_hash, purpose, expires_at, requested_ip) VALUES (:a, :h, :p, :x, :ip)',
            ['a' => $adminId, 'h' => Crypto::hash($token), 'p' => $purpose, 'x' => Database::now($ttlSeconds), 'ip' => Http::ip()]
        );
        return $token;
    }

    /** Returns the token row joined with the admin if valid, unused and unexpired. */
    public static function findToken(string $token, string $purpose): ?array
    {
        if ($token === '' || strlen($token) > 128) {
            return null;
        }
        return Database::one(
            'SELECT pr.id AS token_id, pr.expires_at, pr.used_at, a.id AS admin_id, a.name, a.email, a.status, a.role
               FROM password_resets pr JOIN admins a ON a.id = pr.admin_id
              WHERE pr.token_hash = :h AND pr.purpose = :p LIMIT 1',
            ['h' => Crypto::hash($token), 'p' => $purpose]
        );
    }

    public static function tokenState(?array $row): string
    {
        if ($row === null) {
            return 'invalid';
        }
        if ($row['used_at'] !== null) {
            return 'used';
        }
        if (strtotime($row['expires_at'] . ' UTC') < time()) {
            return 'expired';
        }
        return 'valid';
    }

    public static function ownerExists(): bool
    {
        return (int) Database::value("SELECT COUNT(*) FROM admins WHERE role = 'owner'") > 0;
    }
}
