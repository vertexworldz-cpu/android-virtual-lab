<?php
declare(strict_types=1);

use Bladezux\App;

// Fallbacks for hosts without the mbstring extension (UTF-8 only, used by the app).
if (!function_exists('mb_strlen')) {
    function mb_strlen(string $s, ?string $encoding = null): int
    {
        return preg_match_all('/./us', $s) ?: strlen($s);
    }
}
if (!function_exists('mb_substr')) {
    function mb_substr(string $s, int $start, ?int $length = null, ?string $encoding = null): string
    {
        $chars = preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: str_split($s);
        return implode('', array_slice($chars, $start, $length));
    }
}
if (!function_exists('mb_strtoupper')) {
    function mb_strtoupper(string $s, ?string $encoding = null): string
    {
        return strtoupper($s);
    }
}

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Application URL. Relative to the app base path unless $absolute is true. */
function url(string $path = '', bool $absolute = false): string
{
    $path = ltrim($path, '/');
    $base = $absolute ? App::baseUrl() : App::basePath();
    return $base . '/' . $path;
}

function asset(string $path): string
{
    $file = BZX_PUBLIC_DIR . '/assets/' . ltrim($path, '/');
    $v = is_file($file) ? substr((string) filemtime($file), -6) : BZX_VERSION;
    return url('assets/' . ltrim($path, '/')) . '?v=' . $v;
}

function icon(string $name, string $class = ''): string
{
    $name = preg_replace('/[^a-z0-9\-]/', '', $name);
    return '<svg class="icon ' . e($class) . '" aria-hidden="true" focusable="false"><use href="' . e(asset('img/icons.svg')) . '#' . $name . '"></use></svg>';
}

function format_bytes(int|float|null $bytes, int $precision = 1): string
{
    $bytes = (float) ($bytes ?? 0);
    if ($bytes < 1024) {
        return (int) $bytes . ' B';
    }
    $units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    $i = -1;
    do {
        $bytes /= 1024;
        $i++;
    } while ($bytes >= 1024 && $i < count($units) - 1);
    return number_format($bytes, $bytes >= 100 ? 0 : $precision) . ' ' . $units[$i];
}

/** Converts a UTC DATETIME string to the configured timezone for display. */
function local_time(?string $utc, string $format = 'M j, Y g:i A'): string
{
    if (!$utc) {
        return '—';
    }
    try {
        $dt = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
        return $dt->setTimezone(new DateTimeZone(date_default_timezone_get()))->format($format);
    } catch (Throwable) {
        return '—';
    }
}

function time_ago(?string $utc): string
{
    if (!$utc) {
        return 'never';
    }
    $diff = time() - strtotime($utc . ' UTC');
    return match (true) {
        $diff < 45 => 'just now',
        $diff < 3600 => max(1, (int) round($diff / 60)) . ' min ago',
        $diff < 86400 => (int) round($diff / 3600) . ' h ago',
        $diff < 604800 => (int) round($diff / 86400) . ' d ago',
        default => local_time($utc, 'M j, Y'),
    };
}

function initials(string $name): string
{
    $parts = preg_split('/\s+/u', trim($name)) ?: [];
    $out = '';
    foreach (array_slice($parts, 0, 2) as $p) {
        $out .= mb_strtoupper(mb_substr($p, 0, 1));
    }
    return $out ?: '?';
}

function user_agent_label(?string $ua): string
{
    $ua = (string) $ua;
    $browser = match (true) {
        str_contains($ua, 'Edg/') => 'Edge',
        str_contains($ua, 'OPR/') => 'Opera',
        str_contains($ua, 'Chrome/') => 'Chrome',
        str_contains($ua, 'Firefox/') => 'Firefox',
        str_contains($ua, 'Safari/') => 'Safari',
        default => 'Browser',
    };
    $os = match (true) {
        str_contains($ua, 'Windows') => 'Windows',
        str_contains($ua, 'iPhone'), str_contains($ua, 'iPad') => 'iOS',
        str_contains($ua, 'Android') => 'Android',
        str_contains($ua, 'Mac OS') => 'macOS',
        str_contains($ua, 'Linux') => 'Linux',
        default => 'Unknown OS',
    };
    return "$browser on $os";
}
