<?php
declare(strict_types=1);

namespace Bladezux;

/** Tiny PHP template renderer. Templates live in app/views. */
final class View
{
    public static function render(string $template, array $vars = [], string $layout = 'layout'): void
    {
        $vars['content'] = self::capture($template, $vars);
        echo self::capture($layout, $vars);
    }

    public static function capture(string $template, array $vars = []): string
    {
        $file = BZX_APP_DIR . '/views/' . $template . '.php';
        if (!is_file($file)) {
            throw new \RuntimeException("View not found: $template");
        }
        extract($vars, EXTR_SKIP);
        ob_start();
        try {
            include $file;
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        return (string) ob_get_clean();
    }

    public static function partial(string $template, array $vars = []): void
    {
        echo self::capture($template, $vars);
    }

    public static function errorPage(string $title, string $message, int $status = 500): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: text/html; charset=utf-8');
        }
        try {
            echo self::capture('auth-layout', [
                'title' => $title,
                'content' => self::capture('error', ['title' => $title, 'message' => $message, 'status' => $status]),
            ]);
        } catch (\Throwable) {
            echo '<!doctype html><title>' . e($title) . '</title><h1>' . e($title) . '</h1><p>' . e($message) . '</p>';
        }
        exit;
    }
}
