<?php
declare(strict_types=1);

namespace Bladezux;

/** Key/value application settings stored in `app_settings`. */
final class Settings
{
    private static ?array $cache = null;

    private static function load(): array
    {
        if (self::$cache === null) {
            self::$cache = [];
            foreach (Database::all('SELECT setting_key, setting_value, is_encrypted FROM app_settings') as $row) {
                self::$cache[$row['setting_key']] = $row;
            }
        }
        return self::$cache;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $row = self::load()[$key] ?? null;
        if ($row === null) {
            return $default;
        }
        if ((int) $row['is_encrypted'] === 1) {
            return Crypto::decrypt($row['setting_value']) ?? $default;
        }
        return $row['setting_value'] ?? $default;
    }

    public static function set(string $key, ?string $value, bool $encrypted = false): void
    {
        $stored = $encrypted ? Crypto::encrypt($value) : $value;
        Database::run(
            'INSERT INTO app_settings (setting_key, setting_value, is_encrypted) VALUES (:k, :v, :e)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), is_encrypted = VALUES(is_encrypted)',
            ['k' => $key, 'v' => $stored, 'e' => $encrypted ? 1 : 0]
        );
        self::$cache = null;
    }

    public static function appName(): string
    {
        try {
            return self::get('app_name', 'Bladezux Cloud Storage') ?: 'Bladezux Cloud Storage';
        } catch (\Throwable) {
            return 'Bladezux Cloud Storage';
        }
    }

    public static function chunkSize(): int
    {
        $mb = max(1, min(256, (int) self::get('chunk_size_mb', '16')));
        return $mb * 1024 * 1024; // always a multiple of 256 KiB
    }

    public static function blockedExtensions(): array
    {
        $list = array_map('trim', explode(',', strtolower((string) self::get('blocked_extensions', ''))));
        return array_values(array_filter($list, static fn ($e) => $e !== ''));
    }
}
