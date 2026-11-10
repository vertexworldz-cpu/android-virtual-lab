<?php
use Bladezux\{App, Auth, Csrf, GoogleDrive, Session, Settings, Database};

$user = Auth::user();
$appName = Settings::appName();
$theme = Settings::get('theme', 'light');
$logo = Settings::get('logo_path', '');
$active = $active ?? '';
$drive = GoogleDrive::settings();
$appBytes = (int) Database::value('SELECT COALESCE(SUM(size),0) FROM files');
$limit = $drive['quota_limit'] !== null ? (int) $drive['quota_limit'] : null;
$usage = $drive['quota_usage'] !== null ? (int) $drive['quota_usage'] : null;
$pct = ($limit && $usage !== null) ? min(100, round($usage / $limit * 100, 1)) : null;
$flashes = Session::takeFlashes();
$bootData = [
    'base' => App::basePath(),
    'api' => url('api/index.php'),
    'csrf' => Csrf::token(),
    'icons' => asset('img/icons.svg'),
    'driveConnected' => GoogleDrive::isConnected(),
    'isOwner' => Auth::isOwner(),
    'currentFolder' => $currentFolder ?? null,
    'flashes' => $flashes,
];
$nav = static function (string $key, string $href, string $iconName, string $label) use ($active): string {
    $cls = $active === $key ? ' is-active' : '';
    $aria = $active === $key ? ' aria-current="page"' : '';
    return '<a class="nav-link' . $cls . '" href="' . e(url($href)) . '"' . $aria . '>' . icon($iconName) . '<span>' . e($label) . '</span></a>';
};
?><!doctype html>
<html lang="en" data-theme="<?= e($theme) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e(($title ?? 'Dashboard') . ' · ' . $appName) ?></title>
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="app-body">
<script type="application/json" id="boot-data"><?= json_encode($bootData, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) ?></script>
<?php if (isset($pageData)): ?>
<script type="application/json" id="page-data"><?= json_encode($pageData, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) ?></script>
<?php endif; ?>
<a class="skip-link" href="#main">Skip to content</a>
<div class="shell" id="shell">
  <aside class="sidebar" id="sidebar" aria-label="Primary">
    <div class="sidebar-brand">
      <a href="<?= e(url('dashboard.php')) ?>" class="brand">
        <?php if ($logo): ?>
          <img src="<?= e(url($logo)) ?>" alt="" class="brand-logo-img">
        <?php else: ?>
          <span class="brand-mark" aria-hidden="true"><?= icon('cloud') ?></span>
        <?php endif; ?>
        <span class="brand-text"><strong>BLADEZUX</strong><small>Cloud Storage</small></span>
      </a>
      <button class="icon-btn sidebar-close" type="button" data-action="close-sidebar" aria-label="Close menu"><?= icon('x') ?></button>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-group">
        <?= $nav('dashboard', 'dashboard.php', 'layout-dashboard', 'Dashboard') ?>
        <?= $nav('files', 'files.php', 'folder', 'My Files') ?>
        <?= $nav('recent', 'files.php?view=recent', 'clock', 'Recent') ?>
      </div>
      <div class="nav-group">
        <p class="nav-heading">Browse by type</p>
        <?php foreach (\Bladezux\FileTypes::CATEGORIES as $key => $cat): if ($key === 'other') continue; ?>
          <?= $nav('type-' . $key, 'files.php?type=' . $key, $cat['icon'], $cat['label']) ?>
        <?php endforeach; ?>
      </div>
      <div class="nav-group">
        <p class="nav-heading">Workspace</p>
        <?php if (Auth::isOwner()): ?>
          <?= $nav('admins', 'admins.php', 'users', 'Administrators') ?>
          <?= $nav('activity', 'activity.php', 'activity', 'Activity log') ?>
        <?php endif; ?>
        <?= $nav('settings', 'settings.php', 'settings', 'Settings') ?>
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="storage-meter">
        <div class="storage-meter-head">
          <span><?= icon('hard-drive') ?> Storage</span>
          <?php if ($pct !== null): ?><span class="muted"><?= e($pct) ?>%</span><?php endif; ?>
        </div>
        <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= e($pct ?? 0) ?>"><span style="width: <?= e($pct ?? 0) ?>%"></span></div>
        <p class="storage-meter-text">
          <?php if ($limit): ?>
            <?= e(format_bytes($usage)) ?> of <?= e(format_bytes($limit)) ?> used
          <?php elseif ($usage !== null): ?>
            <?= e(format_bytes($usage)) ?> used · unlimited plan
          <?php else: ?>
            <?= e(format_bytes($appBytes)) ?> stored by this app
          <?php endif; ?>
        </p>
      </div>
      <a class="drive-pill is-<?= e($drive['status']) ?>" href="<?= e(url('settings.php?tab=drive')) ?>">
        <span class="dot"></span>
        <?= $drive['status'] === 'connected' ? 'Google Drive connected' : ($drive['status'] === 'error' ? 'Drive needs attention' : 'Drive not connected') ?>
      </a>
    </div>
  </aside>
  <div class="sidebar-backdrop" data-action="close-sidebar"></div>

  <div class="main-col">
    <header class="topbar">
      <button class="icon-btn menu-btn" type="button" data-action="open-sidebar" aria-label="Open menu"><?= icon('menu') ?></button>
      <form class="search" action="<?= e(url('files.php')) ?>" method="get" role="search">
        <?= icon('search') ?>
        <input type="search" name="q" placeholder="Search files" value="<?= e($_GET['q'] ?? '') ?>" aria-label="Search files" autocomplete="off">
        <kbd class="search-kbd">/</kbd>
      </form>
      <div class="topbar-actions">
        <button class="btn btn-primary upload-trigger" type="button" data-action="upload" <?= GoogleDrive::isConnected() ? '' : 'disabled title="Connect Google Drive first"' ?>>
          <?= icon('upload') ?><span>Upload</span>
        </button>
        <div class="dropdown" data-dropdown>
          <button class="icon-btn notif-btn" type="button" data-dropdown-toggle data-action="load-notifications" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
            <?= icon('bell') ?><span class="badge-dot" id="notif-count" hidden></span>
          </button>
          <div class="dropdown-menu dropdown-wide" role="menu">
            <div class="dropdown-head"><strong>Notifications</strong><button class="link-btn" type="button" data-action="mark-notifications">Mark all read</button></div>
            <div class="notif-list" id="notif-list"><p class="empty-mini">Loading…</p></div>
            <?php if (Auth::isOwner()): ?><a class="dropdown-foot" href="<?= e(url('activity.php')) ?>">View all activity</a><?php endif; ?>
          </div>
        </div>
        <div class="dropdown" data-dropdown>
          <button class="profile-btn" type="button" data-dropdown-toggle aria-haspopup="true" aria-expanded="false">
            <span class="avatar"><?= e(initials($user['name'])) ?></span>
            <span class="profile-meta"><strong><?= e($user['name']) ?></strong><small><?= e(ucfirst($user['role'])) ?></small></span>
            <?= icon('chevron-down', 'chev') ?>
          </button>
          <div class="dropdown-menu" role="menu">
            <div class="dropdown-head stacked"><strong><?= e($user['name']) ?></strong><span class="muted"><?= e($user['email']) ?></span></div>
            <a class="dropdown-item" href="<?= e(url('settings.php?tab=account')) ?>" role="menuitem"><?= icon('user') ?> Profile &amp; password</a>
            <a class="dropdown-item" href="<?= e(url('settings.php?tab=security')) ?>" role="menuitem"><?= icon('shield-check') ?> Security</a>
            <form method="post" action="<?= e(url('logout.php')) ?>">
              <?= Csrf::field() ?>
              <button class="dropdown-item danger" type="submit" role="menuitem"><?= icon('log-out') ?> Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </header>

    <main class="content" id="main">
      <?php if ($drive['status'] === 'error' && ($active !== 'settings')): ?>
        <div class="alert alert-warning"><?= icon('triangle-alert') ?>
          <div><strong>Google Drive needs to be reconnected.</strong> <?= e($drive['last_error'] ?? '') ?>
          <?php if (Auth::isOwner()): ?><a href="<?= e(url('settings.php?tab=drive')) ?>">Open Drive settings</a><?php endif; ?></div>
        </div>
      <?php endif; ?>
      <?= $content ?>
    </main>
  </div>
</div>

<?php \Bladezux\View::partial('upload-panel'); ?>
<div class="toast-stack" id="toasts" aria-live="polite"></div>
<div class="modal-root" id="modal-root"></div>
<script src="<?= e(asset('js/app.js')) ?>"></script>
<script src="<?= e(asset('js/upload.js')) ?>"></script>
<?php foreach (($scripts ?? []) as $s): ?>
<script src="<?= e(asset('js/' . $s)) ?>"></script>
<?php endforeach; ?>
</body>
</html>
