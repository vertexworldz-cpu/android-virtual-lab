<?php
/**
 * Bladezux Cloud Storage — private configuration TEMPLATE.
 *
 * The web installer (storage/install/) writes this file for you. Use this template only
 * for a manual install: copy it to config.php in a folder OUTSIDE public_html, e.g.
 *   /home/CPANELUSER/bladezux-private/config.php
 * and fill in every value. Never commit the real config.php to source control.
 *
 * Generate the two secrets with:
 *   php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"   (app.key)
 *   php -r "echo bin2hex(random_bytes(12)), PHP_EOL;"         (app.setup_key)
 */
return [
    'app' => [
        // Public URL of the storage folder, no trailing slash.
        'base_url' => 'https://yourdomain.com/storage',
        // 32-byte base64 key used to encrypt OAuth tokens and the SMTP password.
        // Changing it later makes stored secrets unreadable (reconnect Drive + re-save SMTP).
        'key' => 'REPLACE_WITH_BASE64_32_BYTE_KEY',
        // One-time key required by signup.php to create the first owner (manual installs).
        'setup_key' => 'REPLACE_WITH_RANDOM_SETUP_KEY',
        // Redirect HTTP to HTTPS and send HSTS. Keep true in production.
        'force_https' => true,
        // Set true only behind a trusted reverse proxy / CDN that sets X-Forwarded-*.
        'trust_proxy' => false,
    ],
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'cpaneluser_bladezux',
        'user' => 'cpaneluser_bzx',
        'pass' => 'database-password',
    ],
    'paths' => [
        // Must be writable by PHP and outside public_html.
        'logs' => '/home/CPANELUSER/bladezux-private/logs',
    ],
];
