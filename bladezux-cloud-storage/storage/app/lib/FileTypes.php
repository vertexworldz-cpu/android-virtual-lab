<?php
declare(strict_types=1);

namespace Bladezux;

/** File categorisation, validation and safe naming. */
final class FileTypes
{
    public const CATEGORIES = [
        'image' => ['label' => 'Images', 'icon' => 'image'],
        'video' => ['label' => 'Videos', 'icon' => 'film'],
        'audio' => ['label' => 'Audio', 'icon' => 'music'],
        'document' => ['label' => 'Documents', 'icon' => 'file-text'],
        'pdf' => ['label' => 'PDF', 'icon' => 'file-type'],
        'archive' => ['label' => 'Archives', 'icon' => 'file-archive'],
        'spreadsheet' => ['label' => 'Spreadsheets', 'icon' => 'file-spreadsheet'],
        'presentation' => ['label' => 'Presentations', 'icon' => 'presentation'],
        'other' => ['label' => 'Other', 'icon' => 'file'],
    ];

    private const EXT_MAP = [
        'image' => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'heif', 'avif', 'ico', 'psd', 'raw', 'cr2', 'nef'],
        'video' => ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', 'ts'],
        'audio' => ['mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'wma', 'opus', 'aiff'],
        'pdf' => ['pdf'],
        'archive' => ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'dmg'],
        'spreadsheet' => ['xls', 'xlsx', 'xlsm', 'csv', 'ods', 'numbers', 'tsv'],
        'presentation' => ['ppt', 'pptx', 'odp', 'key', 'pps', 'ppsx'],
        'document' => ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'tex', 'epub', 'json', 'xml', 'html', 'css', 'js', 'log'],
    ];

    /** Formats that can be previewed inline in a browser. */
    private const PREVIEWABLE_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif'];
    private const PREVIEWABLE_VIDEO = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    private const PREVIEWABLE_AUDIO = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/opus'];

    /** MIME types that are never accepted, regardless of extension. */
    private const DANGEROUS_MIME = [
        'application/x-php', 'text/x-php', 'application/x-httpd-php', 'application/x-dosexec', 'application/x-msdownload',
        'application/x-executable', 'application/x-sharedlib', 'application/x-mach-binary', 'application/x-msi',
        'text/x-shellscript', 'application/x-sh', 'text/x-perl', 'text/x-python', 'application/x-elf',
    ];

    public static function extension(string $name): string
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        return preg_match('/^[a-z0-9]{1,16}$/', $ext) ? $ext : '';
    }

    public static function category(string $name, string $mime = ''): string
    {
        $ext = self::extension($name);
        foreach (self::EXT_MAP as $cat => $exts) {
            if (in_array($ext, $exts, true)) {
                return $cat;
            }
        }
        return match (true) {
            str_starts_with($mime, 'image/') => 'image',
            str_starts_with($mime, 'video/') => 'video',
            str_starts_with($mime, 'audio/') => 'audio',
            $mime === 'application/pdf' => 'pdf',
            str_starts_with($mime, 'text/') => 'document',
            default => 'other',
        };
    }

    public static function previewKind(string $mime, string $category): ?string
    {
        return match (true) {
            in_array($mime, self::PREVIEWABLE_IMAGE, true) => 'image',
            $mime === 'application/pdf' => 'pdf',
            in_array($mime, self::PREVIEWABLE_VIDEO, true) => 'video',
            in_array($mime, self::PREVIEWABLE_AUDIO, true) || ($category === 'audio' && str_starts_with($mime, 'audio/')) => 'audio',
            default => null,
        };
    }

    /** Guess a MIME type from the extension (browser-supplied types are untrusted). */
    public static function mimeFromExtension(string $ext): string
    {
        static $map = [
            'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp',
            'bmp' => 'image/bmp', 'svg' => 'image/svg+xml', 'tif' => 'image/tiff', 'tiff' => 'image/tiff', 'heic' => 'image/heic',
            'avif' => 'image/avif', 'ico' => 'image/x-icon', 'psd' => 'image/vnd.adobe.photoshop',
            'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'mov' => 'video/quicktime', 'avi' => 'video/x-msvideo', 'mkv' => 'video/x-matroska',
            'webm' => 'video/webm', 'wmv' => 'video/x-ms-wmv', 'flv' => 'video/x-flv', 'mpeg' => 'video/mpeg', 'mpg' => 'video/mpeg', '3gp' => 'video/3gpp',
            'mp3' => 'audio/mpeg', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'flac' => 'audio/flac', 'aac' => 'audio/aac',
            'm4a' => 'audio/mp4', 'wma' => 'audio/x-ms-wma', 'opus' => 'audio/opus',
            'pdf' => 'application/pdf',
            'zip' => 'application/zip', 'rar' => 'application/vnd.rar', '7z' => 'application/x-7z-compressed', 'tar' => 'application/x-tar',
            'gz' => 'application/gzip', 'tgz' => 'application/gzip', 'bz2' => 'application/x-bzip2', 'xz' => 'application/x-xz', 'iso' => 'application/x-iso9660-image',
            'xls' => 'application/vnd.ms-excel', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'csv' => 'text/csv', 'ods' => 'application/vnd.oasis.opendocument.spreadsheet', 'tsv' => 'text/tab-separated-values',
            'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'odp' => 'application/vnd.oasis.opendocument.presentation',
            'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'odt' => 'application/vnd.oasis.opendocument.text', 'rtf' => 'application/rtf', 'txt' => 'text/plain', 'md' => 'text/markdown',
            'json' => 'application/json', 'xml' => 'application/xml', 'html' => 'text/html', 'css' => 'text/css', 'js' => 'text/javascript',
            'epub' => 'application/epub+zip', 'log' => 'text/plain',
        ];
        return $map[$ext] ?? 'application/octet-stream';
    }

    /** Normalises a user-supplied file or folder name. Returns '' when unusable. */
    public static function sanitizeName(string $name): string
    {
        $name = str_replace(["\0", '/', '\\'], '', $name);
        $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
        $name = preg_replace('/\s+/u', ' ', $name) ?? '';
        $name = trim($name, " .\t");
        if (class_exists(\Normalizer::class)) {
            $name = \Normalizer::normalize($name, \Normalizer::FORM_C) ?: $name;
        }
        if (mb_strlen($name) > 200) {
            $ext = self::extension($name);
            $base = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 190);
            $name = $ext !== '' ? "$base.$ext" : $base;
        }
        return $name;
    }

    /**
     * Validates an upload before a Drive session is created.
     * @param string $head first bytes of the file (sent by the browser) for magic-number sniffing
     * @return string|null error message
     */
    public static function validateUpload(string $name, int $size, string $head): ?string
    {
        if ($name === '') {
            return 'The file name is not valid.';
        }
        if ($size <= 0) {
            return 'Empty files cannot be uploaded.';
        }
        // Google Drive's per-file upload limit is 5 TB.
        if ($size > 5 * 1024 ** 4) {
            return 'Google Drive accepts files up to 5 TB.';
        }
        $max = (int) Settings::get('max_upload_bytes', '0');
        if ($max > 0 && $size > $max) {
            return 'This file exceeds the maximum upload size of ' . format_bytes($max) . '.';
        }
        $ext = self::extension($name);
        $parts = explode('.', strtolower($name));
        array_shift($parts);
        foreach ($parts as $part) {
            // Blocks double extensions such as invoice.php.jpg as well.
            if (in_array($part, Settings::blockedExtensions(), true)) {
                return 'Files of type ".' . $part . '" are not allowed for security reasons.';
            }
        }
        if ($head !== '' && function_exists('finfo_open')) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $detected = (string) $finfo->buffer($head);
            if (in_array($detected, self::DANGEROUS_MIME, true)) {
                return 'This file appears to be an executable or script, which is not allowed.';
            }
            if (str_starts_with($head, '<?php') || preg_match('/^\s*<\?php/i', $head)) {
                return 'PHP source files are not allowed.';
            }
            // Declared image/PDF types must match their content signature.
            $expected = self::mimeFromExtension($ext);
            if ((str_starts_with($expected, 'image/') && !in_array($ext, ['svg', 'heic', 'heif', 'psd', 'raw', 'cr2', 'nef', 'ico', 'avif'], true)
                    && !str_starts_with($detected, 'image/') && $detected !== 'application/octet-stream')
                || ($ext === 'pdf' && $detected !== 'application/pdf' && $detected !== 'application/octet-stream')) {
                return 'The file content does not match its ".' . $ext . '" extension.';
            }
        }
        return null;
    }

    public static function iconFor(string $category): string
    {
        return self::CATEGORIES[$category]['icon'] ?? 'file';
    }
}
