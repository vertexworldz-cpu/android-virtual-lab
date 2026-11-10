<?php
/**
 * Bladezux Cloud Storage — web installer.
 * Runs once: checks hosting compatibility, creates the database schema,
 * writes the private config file and creates the owner account.
 * It locks itself as soon as a config.php exists. Delete this folder after installing.
 */
declare(strict_types=1);

define('BZX_INSTALLER', true);
require dirname(__DIR__) . '/app/bootstrap.php';

use Bladezux\{App, Database};

session_name('BZXINSTALL');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => App::isHttps()]);
session_start();
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'");
header('Cache-Control: no-store');

if (empty($_SESSION['install_csrf'])) {
    $_SESSION['install_csrf'] = bin2hex(random_bytes(32));
}

$installed = App::locatePrivateDir() !== null;
$homeDir = dirname(BZX_PUBLIC_DIR, 2);
$suggestedPrivate = $homeDir . '/bladezux-private';
$fallbackPrivate = BZX_APP_DIR . '/private';

// ------------------------------------------------------------ requirements
$iniBytes = static function (string $key): int {
    $v = trim((string) ini_get($key));
    if ($v === '' || $v === '-1') {
        return PHP_INT_MAX;
    }
    $n = (int) $v;
    return match (strtolower(substr($v, -1))) { 'g' => $n << 30, 'm' => $n << 20, 'k' => $n << 10, default => $n };
};
$checks = [];
$add = static function (string $label, string $level, string $value) use (&$checks): void {
    $checks[] = compact('label', 'level', 'value');
};
$add('PHP version 8.2 or newer', PHP_VERSION_ID >= 80200 ? 'ok' : 'bad', PHP_VERSION);
foreach (['pdo_mysql' => 'MySQL database access', 'curl' => 'Google Drive API calls', 'openssl' => 'Token encryption + TLS', 'json' => 'API responses', 'session' => 'Secure sessions'] as $ext => $why) {
    $add("Extension: $ext ($why)", extension_loaded($ext) ? 'ok' : 'bad', extension_loaded($ext) ? 'installed' : 'missing');
}
foreach (['mbstring' => 'Unicode file names', 'fileinfo' => 'MIME type validation', 'intl' => 'Unicode name normalisation', 'gd' => 'Logo validation'] as $ext => $why) {
    $fallback = in_array($ext, ['mbstring', 'fileinfo'], true) ? 'recommended — built-in fallback used' : 'optional';
    $add("Extension: $ext ($why)", extension_loaded($ext) ? 'ok' : 'warn', extension_loaded($ext) ? 'installed' : $fallback);
}
$add('HTTPS', App::isHttps() ? 'ok' : 'warn', App::isHttps() ? 'enabled' : 'not detected — enable SSL before going live');
$add('post_max_size (relay fallback chunk limit)', $iniBytes('post_max_size') >= 8 << 20 ? 'ok' : 'warn', (string) ini_get('post_max_size'));
$add('memory_limit', $iniBytes('memory_limit') >= 64 << 20 ? 'ok' : 'warn', (string) ini_get('memory_limit'));
$add('max_execution_time', ((int) ini_get('max_execution_time') === 0 || (int) ini_get('max_execution_time') >= 60) ? 'ok' : 'warn', ini_get('max_execution_time') . 's');
$add('allow_url_fopen not required (cURL is used)', 'ok', ini_get('allow_url_fopen') ? 'on' : 'off');
$privateWritable = is_writable(dirname($suggestedPrivate)) || is_dir($suggestedPrivate) && is_writable($suggestedPrivate);
$add('Private folder outside public_html', $privateWritable ? 'ok' : 'warn', $privateWritable ? $suggestedPrivate : 'not writable — fallback inside protected app/ folder');
$add('Branding upload folder writable', is_writable(BZX_PUBLIC_DIR . '/uploads/branding') ? 'ok' : 'warn', 'storage/uploads/branding');
$blocking = array_filter($checks, static fn ($c) => $c['level'] === 'bad');

// ---------------------------------------------------------------- install
$errors = [];
$done = null;
$scheme = App::isHttps() ? 'https' : 'http';
$guessBase = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'yourdomain.com') . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/storage/install/index.php')), '/');
$old = [
    'base_url' => $guessBase, 'db_host' => 'localhost', 'db_port' => '3306', 'db_name' => '', 'db_user' => '',
    'owner_name' => '', 'owner_email' => '', 'private_dir' => $privateWritable ? $suggestedPrivate : $fallbackPrivate,
];

if (!$installed && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($_SESSION['install_csrf'], (string) ($_POST['_csrf'] ?? ''))) {
        $errors[] = 'Security token expired. Reload the page and try again.';
    }
    foreach ($old as $k => $_) {
        $old[$k] = trim((string) ($_POST[$k] ?? ''));
    }
    $dbPass = (string) ($_POST['db_pass'] ?? '');
    $ownerPass = (string) ($_POST['owner_password'] ?? '');
    $ownerPass2 = (string) ($_POST['owner_password_confirm'] ?? '');

    if ($blocking) {
        $errors[] = 'Fix the failed requirements first.';
    }
    if (!filter_var($old['base_url'], FILTER_VALIDATE_URL) || !preg_match('#^https?://#', $old['base_url'])) {
        $errors[] = 'Enter the full application URL, e.g. https://yourdomain.com/storage';
    }
    if ($old['db_name'] === '' || $old['db_user'] === '') {
        $errors[] = 'Database name and user are required.';
    }
    if (mb_strlen($old['owner_name']) < 2) {
        $errors[] = 'Enter the owner\'s full name.';
    }
    if (!filter_var($old['owner_email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Enter a valid owner email address.';
    }
    if (strlen($ownerPass) < 10 || !preg_match('/[A-Za-z]/', $ownerPass) || !preg_match('/\d/', $ownerPass)) {
        $errors[] = 'Owner password must be at least 10 characters and include a letter and a number.';
    } elseif ($ownerPass !== $ownerPass2) {
        $errors[] = 'Owner password confirmation does not match.';
    }
    $privateDir = rtrim($old['private_dir'], '/');
    $realPublic = realpath(dirname(BZX_PUBLIC_DIR)) ?: dirname(BZX_PUBLIC_DIR);
    if ($privateDir === '' || (str_starts_with($privateDir, $realPublic) && !str_starts_with($privateDir, BZX_APP_DIR))) {
        $errors[] = 'The private folder must be outside public_html (or the protected storage/app/private fallback).';
    }

    $db = ['host' => $old['db_host'], 'port' => (int) $old['db_port'], 'name' => $old['db_name'], 'user' => $old['db_user'], 'pass' => $dbPass];
    $pdo = null;
    if (!$errors) {
        try {
            $pdo = Database::connect($db);
        } catch (\PDOException $e) {
            $errors[] = 'Database connection failure: check the host, database name, user and password. (' . preg_replace('/\s+/', ' ', mb_substr($e->getMessage(), 0, 120)) . ')';
        }
    }
    if ($pdo && !$errors) {
        try {
            $existing = $pdo->query("SHOW TABLES LIKE 'admins'")->fetchColumn();
            if ($existing && (int) $pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) {
                $errors[] = 'This database already contains a Bladezux installation. Use an empty database, or restore the existing config.php.';
            }
        } catch (\PDOException) {
        }
    }
    if ($pdo && !$errors) {
        try {
            $sqlFile = is_file(__DIR__ . '/install.sql') ? __DIR__ . '/install.sql' : dirname(BZX_PUBLIC_DIR) . '/database/install.sql';
            $sql = (string) file_get_contents($sqlFile);
            $sql = preg_replace('/^\s*--.*$/m', '', $sql);
            foreach (preg_split('/;\s*$/m', (string) $sql) as $statement) {
                if (trim($statement) !== '') {
                    $pdo->exec($statement);
                }
            }
            if (!is_dir($privateDir) && !@mkdir($privateDir, 0750, true)) {
                throw new \RuntimeException('Could not create the private folder: ' . $privateDir);
            }
            @mkdir($privateDir . '/logs', 0750, true);
            @file_put_contents($privateDir . '/.htaccess', "Require all denied\nDeny from all\n");
            @file_put_contents($privateDir . '/logs/.htaccess', "Require all denied\nDeny from all\n");

            $key = base64_encode(random_bytes(32));
            $setupKey = bin2hex(random_bytes(12));
            $config = "<?php\n// Bladezux Cloud Storage — private configuration. KEEP THIS FILE SECRET.\n// Generated by the installer on " . gmdate('Y-m-d H:i') . " UTC.\nreturn " . var_export([
                'app' => [
                    'base_url' => rtrim($old['base_url'], '/'),
                    'key' => $key,
                    'setup_key' => $setupKey,
                    'force_https' => str_starts_with($old['base_url'], 'https://'),
                    'trust_proxy' => false,
                ],
                'db' => $db,
                'paths' => ['logs' => $privateDir . '/logs'],
            ], true) . ";\n";
            if (@file_put_contents($privateDir . '/config.php', $config, LOCK_EX) === false) {
                throw new \RuntimeException('Could not write ' . $privateDir . '/config.php');
            }
            @chmod($privateDir . '/config.php', 0640);

            $stmt = $pdo->prepare("INSERT INTO admins (name, email, password_hash, role, status, password_changed_at) VALUES (?, ?, ?, 'owner', 'active', UTC_TIMESTAMP())");
            $stmt->execute([$old['owner_name'], strtolower($old['owner_email']), password_hash($ownerPass, PASSWORD_DEFAULT)]);
            $pdo->prepare("INSERT INTO activity_logs (admin_id, action, target_type, description, ip_address) VALUES (?, 'admin.owner_created', 'admin', 'Installed Bladezux Cloud Storage and created the owner account', ?)")
                ->execute([(int) $pdo->lastInsertId(), substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45)]);
            $done = ['private' => $privateDir, 'url' => rtrim($old['base_url'], '/')];
            $installed = true;
        } catch (\Throwable $e) {
            $errors[] = 'Installation failed: ' . $e->getMessage();
        }
    }
}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Install · Bladezux Cloud Storage</title>
<link rel="stylesheet" href="../assets/css/app.css">
</head>
<body class="install-body">
<div class="install-wrap">
  <div class="brand">
    <span class="brand-mark"><svg class="icon" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></span>
    <span class="brand-text"><strong>BLADEZUX</strong><small>Cloud Storage · Installer</small></span>
  </div>

<?php if ($done): ?>
  <section class="card">
    <header class="card-head"><div><h2>Installation complete</h2><p class="muted">Your private storage workspace is ready.</p></div></header>
    <div class="card-body">
      <ol>
        <li>Private configuration written to <code><?= e($done['private']) ?>/config.php</code>.</li>
        <li><strong>Delete the <code>storage/install/</code> folder now</strong> (cPanel → File Manager). The installer is locked, but removing it is safest.</li>
        <li>Sign in, then open <em>Settings → Google Drive</em> to connect Drive and <em>Settings → Email</em> to configure SMTP.</li>
      </ol>
    </div>
    <footer class="card-foot"><a class="btn btn-primary" href="<?= e($done['url']) ?>/login.php">Go to sign in</a></footer>
  </section>
<?php elseif ($installed): ?>
  <section class="card"><div class="card-body">
    <h2>Already installed</h2>
    <p class="muted" style="margin-top:6px">A configuration file already exists, so the installer is locked. Delete the <code>storage/install/</code> folder from your server.</p>
  </div><footer class="card-foot"><a class="btn btn-primary" href="../login.php">Go to sign in</a></footer></section>
<?php else: ?>
  <section class="card">
    <header class="card-head"><div><h2>1 · Hosting compatibility</h2><p class="muted">Checked against your current PHP configuration.</p></div></header>
    <div class="card-body">
      <ul class="check-list">
        <?php foreach ($checks as $c): ?>
          <li><span class="<?= $c['level'] ?>"><?= $c['level'] === 'ok' ? '✔' : ($c['level'] === 'warn' ? '!' : '✖') ?></span><?= e($c['label']) ?><span class="val"><?= e($c['value']) ?></span></li>
        <?php endforeach; ?>
      </ul>
      <?php if ($blocking): ?><div class="alert alert-error" style="margin-top:14px"><div>Ask your host to enable the missing items (cPanel → Select PHP Version → Extensions).</div></div><?php endif; ?>
    </div>
  </section>

  <form class="card" method="post" autocomplete="off">
    <input type="hidden" name="_csrf" value="<?= e($_SESSION['install_csrf']) ?>">
    <header class="card-head"><div><h2>2 · Configure</h2><p class="muted">Create an empty MySQL database and user in cPanel → MySQL Databases first.</p></div></header>
    <div class="card-body">
      <?php if ($errors): ?><div class="alert alert-error"><div><?php foreach ($errors as $err): ?><div><?= e($err) ?></div><?php endforeach; ?></div></div><?php endif; ?>
      <div class="form-grid">
        <div class="field span-2"><label for="base_url">Application URL</label><input id="base_url" name="base_url" required value="<?= e($old['base_url']) ?>"><p class="hint">Where this folder is reachable, e.g. https://yourdomain.com/storage</p></div>
        <div class="field"><label for="db_host">Database host</label><input id="db_host" name="db_host" required value="<?= e($old['db_host']) ?>"></div>
        <div class="field"><label for="db_port">Port</label><input id="db_port" name="db_port" required value="<?= e($old['db_port']) ?>"></div>
        <div class="field"><label for="db_name">Database name</label><input id="db_name" name="db_name" required value="<?= e($old['db_name']) ?>" placeholder="cpaneluser_bladezux"></div>
        <div class="field"><label for="db_user">Database user</label><input id="db_user" name="db_user" required value="<?= e($old['db_user']) ?>"></div>
        <div class="field span-2"><label for="db_pass">Database password</label><input id="db_pass" name="db_pass" type="password"></div>
        <div class="field span-2"><label for="private_dir">Private folder (outside public_html)</label><input id="private_dir" name="private_dir" required value="<?= e($old['private_dir']) ?>"><p class="hint">Holds config.php (database password, encryption key) and logs. Never place it inside public_html.</p></div>
      </div>
      <h3 style="margin:26px 0 12px">Owner account</h3>
      <div class="form-grid">
        <div class="field"><label for="owner_name">Full name</label><input id="owner_name" name="owner_name" required value="<?= e($old['owner_name']) ?>"></div>
        <div class="field"><label for="owner_email">Email (used to sign in)</label><input id="owner_email" name="owner_email" type="email" required value="<?= e($old['owner_email']) ?>"></div>
        <div class="field"><label for="owner_password">Password</label><input id="owner_password" name="owner_password" type="password" required autocomplete="new-password"></div>
        <div class="field"><label for="owner_password_confirm">Confirm password</label><input id="owner_password_confirm" name="owner_password_confirm" type="password" required autocomplete="new-password"></div>
      </div>
      <p class="hint" style="margin-top:10px">The owner login is independent of your cPanel credentials.</p>
    </div>
    <footer class="card-foot"><button class="btn btn-primary" type="submit" <?= $blocking ? 'disabled' : '' ?>>Install Bladezux Cloud Storage</button></footer>
  </form>
<?php endif; ?>
</div>
</body>
</html>
