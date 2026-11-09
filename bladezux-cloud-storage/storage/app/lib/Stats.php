<?php
declare(strict_types=1);

namespace Bladezux;

/** Dashboard statistics computed from live database + Drive quota data. */
final class Stats
{
    public static function dashboard(): array
    {
        $totals = Database::one('SELECT COUNT(*) AS files, COALESCE(SUM(size),0) AS bytes FROM files');
        $folders = (int) Database::value('SELECT COUNT(*) FROM folders');

        $byCategory = [];
        foreach (FileTypes::CATEGORIES as $key => $meta) {
            $byCategory[$key] = ['key' => $key, 'label' => $meta['label'], 'count' => 0, 'bytes' => 0];
        }
        foreach (Database::all('SELECT category, COUNT(*) AS c, COALESCE(SUM(size),0) AS s FROM files GROUP BY category') as $r) {
            $byCategory[$r['category']]['count'] = (int) $r['c'];
            $byCategory[$r['category']]['bytes'] = (int) $r['s'];
        }

        // Uploads per day for the last 14 days (in the configured timezone).
        $tz = new \DateTimeZone(date_default_timezone_get());
        $days = [];
        $start = (new \DateTimeImmutable('today', $tz))->modify('-13 days');
        for ($i = 0; $i < 14; $i++) {
            $d = $start->modify("+$i days");
            $days[$d->format('Y-m-d')] = ['date' => $d->format('Y-m-d'), 'label' => $d->format('M j'), 'count' => 0, 'bytes' => 0];
        }
        $rows = Database::all('SELECT created_at, size FROM files WHERE created_at >= :s', [
            's' => $start->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        ]);
        foreach ($rows as $r) {
            $key = (new \DateTimeImmutable($r['created_at'], new \DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d');
            if (isset($days[$key])) {
                $days[$key]['count']++;
                $days[$key]['bytes'] += (int) $r['size'];
            }
        }

        $g = GoogleDrive::settings();
        $limit = $g['quota_limit'] !== null ? (int) $g['quota_limit'] : null;
        $usage = $g['quota_usage'] !== null ? (int) $g['quota_usage'] : null;

        return [
            'total_files' => (int) $totals['files'],
            'total_folders' => $folders,
            'app_bytes' => (int) $totals['bytes'],
            'drive_limit' => $limit,
            'drive_usage' => $usage,
            'drive_available' => ($limit !== null && $usage !== null) ? max(0, $limit - $usage) : null,
            'quota_updated_at' => $g['quota_updated_at'],
            'categories' => array_values($byCategory),
            'daily' => array_values($days),
            'drive_status' => $g['status'],
            'drive_email' => $g['account_email'],
        ];
    }

    public static function recentUploads(int $limit = 6): array
    {
        return array_map([Files::class, 'presentFile'], Database::all(
            'SELECT f.*, a.name AS uploader_name, fo.name AS folder_name FROM files f
               LEFT JOIN admins a ON a.id = f.uploaded_by LEFT JOIN folders fo ON fo.id = f.folder_id
              ORDER BY f.created_at DESC, f.id DESC LIMIT ' . max(1, min(50, $limit))
        ));
    }

    public static function recentActivity(int $limit = 8, ?int $adminId = null): array
    {
        $sql = 'SELECT l.*, a.name AS admin_name FROM activity_logs l LEFT JOIN admins a ON a.id = l.admin_id';
        $params = [];
        if ($adminId) {
            $sql .= ' WHERE l.admin_id = :a';
            $params['a'] = $adminId;
        }
        $sql .= ' ORDER BY l.id DESC LIMIT ' . max(1, min(100, $limit));
        return Database::all($sql, $params);
    }
}
