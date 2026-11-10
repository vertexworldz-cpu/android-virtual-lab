<?php
declare(strict_types=1);

namespace Bladezux;

/** Audit trail writer. */
final class Activity
{
    public static function log(string $action, string $description, ?string $targetType = null, int|string|null $targetId = null, ?int $adminId = null): void
    {
        try {
            Database::run(
                'INSERT INTO activity_logs (admin_id, action, target_type, target_id, description, ip_address, user_agent)
                 VALUES (:a, :ac, :tt, :ti, :d, :ip, :ua)',
                [
                    'a' => $adminId ?? Auth::id(),
                    'ac' => $action,
                    'tt' => $targetType,
                    'ti' => $targetId === null ? null : (string) $targetId,
                    'd' => mb_substr($description, 0, 500),
                    'ip' => Http::ip(),
                    'ua' => Http::userAgent(),
                ]
            );
        } catch (\Throwable $e) {
            Logger::error('Activity log failed: ' . $e->getMessage());
        }
    }

    public static function icon(string $action): string
    {
        return match (true) {
            str_starts_with($action, 'file.upload') => 'upload',
            str_starts_with($action, 'file.delete'), str_starts_with($action, 'folder.delete') => 'trash-2',
            str_starts_with($action, 'file.rename'), str_starts_with($action, 'folder.rename') => 'pencil',
            str_starts_with($action, 'file.move') => 'folder-input',
            str_starts_with($action, 'file.download') => 'download',
            str_starts_with($action, 'folder.') => 'folder-plus',
            str_starts_with($action, 'auth.') => 'log-in',
            str_starts_with($action, 'drive.') => 'cloud',
            str_starts_with($action, 'admin.') => 'users',
            str_starts_with($action, 'settings.') => 'settings',
            default => 'activity',
        };
    }
}
