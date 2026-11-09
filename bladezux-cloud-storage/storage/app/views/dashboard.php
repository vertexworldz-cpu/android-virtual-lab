<?php
use Bladezux\{Auth, FileTypes, Activity};
$hour = (int) date('G');
$greeting = $hour < 12 ? 'Good morning' : ($hour < 18 ? 'Good afternoon' : 'Good evening');
$first = explode(' ', $user['name'])[0];
$connected = $stats['drive_status'] === 'connected';
?>
<div class="page-head">
  <div>
    <h1><?= e($greeting) ?>, <?= e($first) ?></h1>
    <p class="muted">Here is what is happening in your storage workspace today.</p>
  </div>
  <div class="page-actions">
    <a class="btn btn-secondary" href="<?= e(url('files.php')) ?>"><?= icon('folder-open') ?><span>Open files</span></a>
    <button class="btn btn-primary" type="button" data-action="upload" <?= $connected ? '' : 'disabled' ?>><?= icon('upload') ?><span>Quick upload</span></button>
  </div>
</div>

<?php if (!$connected): ?>
  <div class="callout">
    <span class="callout-icon"><?= icon('cloud-off') ?></span>
    <div class="callout-body">
      <strong><?= $stats['drive_status'] === 'error' ? 'Google Drive needs to be reconnected' : 'Connect Google Drive to start uploading' ?></strong>
      <p class="muted">Files are stored privately in your company Google Drive. <?= Auth::isOwner() ? 'Add your OAuth credentials and authorise access.' : 'Ask the workspace owner to connect Google Drive.' ?></p>
    </div>
    <?php if (Auth::isOwner()): ?><a class="btn btn-primary" href="<?= e(url('settings.php?tab=drive')) ?>"><?= icon('link') ?><span>Connect Drive</span></a><?php endif; ?>
  </div>
<?php endif; ?>

<section class="stat-grid" aria-label="Key figures">
  <article class="stat-card">
    <span class="stat-icon tone-indigo"><?= icon('files') ?></span>
    <div><p class="stat-label">Total files</p><p class="stat-value"><?= number_format($stats['total_files']) ?></p></div>
  </article>
  <article class="stat-card">
    <span class="stat-icon tone-violet"><?= icon('folder') ?></span>
    <div><p class="stat-label">Total folders</p><p class="stat-value"><?= number_format($stats['total_folders']) ?></p></div>
  </article>
  <article class="stat-card">
    <span class="stat-icon tone-blue"><?= icon('database') ?></span>
    <div><p class="stat-label">Storage used</p><p class="stat-value"><?= e(format_bytes($stats['drive_usage'] ?? $stats['app_bytes'])) ?></p>
      <p class="stat-sub"><?= e(format_bytes($stats['app_bytes'])) ?> stored by this app</p></div>
  </article>
  <article class="stat-card">
    <span class="stat-icon tone-green"><?= icon('hard-drive') ?></span>
    <div><p class="stat-label">Available storage</p>
      <p class="stat-value"><?= $stats['drive_available'] !== null ? e(format_bytes($stats['drive_available'])) : ($stats['drive_usage'] !== null ? 'Unlimited' : '—') ?></p>
      <p class="stat-sub"><?= $stats['drive_limit'] ? 'of ' . e(format_bytes($stats['drive_limit'])) . ' total' : ($connected ? 'Pooled / unlimited quota' : 'Connect Drive to see quota') ?></p></div>
  </article>
</section>

<section class="dash-grid charts">
  <article class="card">
    <header class="card-head">
      <div><h2>Storage usage</h2><p class="muted">Google Drive quota<?= $stats['quota_updated_at'] ? ' · updated ' . e(time_ago($stats['quota_updated_at'])) : '' ?></p></div>
      <?php if ($connected): ?><button class="icon-btn" type="button" data-action="refresh-quota" title="Refresh" aria-label="Refresh storage information"><?= icon('refresh-cw') ?></button><?php endif; ?>
    </header>
    <div class="card-body"><div id="storage-chart" class="storage-chart"></div></div>
  </article>
  <article class="card">
    <header class="card-head"><div><h2>File categories</h2><p class="muted">Share of stored bytes by type</p></div></header>
    <div class="card-body"><div id="category-chart" class="category-chart"></div></div>
  </article>
  <article class="card span-2">
    <header class="card-head"><div><h2>Upload activity</h2><p class="muted">Files uploaded over the last 14 days</p></div></header>
    <div class="card-body"><div id="daily-chart" class="bar-chart"></div></div>
  </article>
</section>

<section class="dash-grid">
  <article class="card">
    <header class="card-head"><div><h2>Recent uploads</h2></div><a class="link-sm" href="<?= e(url('files.php?view=recent')) ?>">View all</a></header>
    <div class="card-body flush">
      <?php if (!$recent): ?>
        <div class="empty-mini-block"><?= icon('cloud-upload') ?><p>No files yet. Upload your first file to get started.</p></div>
      <?php else: ?>
        <ul class="recent-list">
          <?php foreach ($recent as $f): ?>
            <li>
              <a href="<?= e(url('files.php' . ($f['folder_id'] ? '?folder=' . $f['folder_id'] : '') . '#file-' . $f['id'])) ?>">
                <span class="file-badge cat-<?= e($f['category']) ?>"><?= icon($f['icon']) ?></span>
                <span class="recent-meta"><strong><?= e($f['name']) ?></strong><small><?= e($f['size_h']) ?> · <?= e($f['folder_name']) ?></small></span>
                <span class="muted recent-date"><?= e($f['created_short']) ?></span>
              </a>
            </li>
          <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </div>
  </article>
  <article class="card">
    <header class="card-head"><div><h2>Recent activity</h2></div><?php if (Auth::isOwner()): ?><a class="link-sm" href="<?= e(url('activity.php')) ?>">View log</a><?php endif; ?></header>
    <div class="card-body flush">
      <?php if (!$activity): ?>
        <div class="empty-mini-block"><?= icon('activity') ?><p>No activity recorded yet.</p></div>
      <?php else: ?>
        <ul class="timeline">
          <?php foreach ($activity as $a): ?>
            <li><span class="timeline-icon"><?= icon(Activity::icon($a['action'])) ?></span>
              <div><p><?= e($a['description']) ?></p><small class="muted"><?= e($a['admin_name'] ?? 'System') ?> · <?= e(time_ago($a['created_at'])) ?></small></div></li>
          <?php endforeach; ?>
        </ul>
      <?php endif; ?>
    </div>
  </article>
  <article class="card drive-card">
    <header class="card-head"><div><h2>Google Drive</h2></div><span class="status-chip is-<?= e($drive['status']) ?>"><span class="dot"></span><?= e(match ($drive['status']) { 'connected' => 'Connected', 'error' => 'Action needed', 'disconnected' => 'Disconnected', default => 'Not configured' }) ?></span></header>
    <div class="card-body">
      <dl class="kv">
        <div><dt>Account</dt><dd><?= e($drive['account_email'] ?? '—') ?></dd></div>
        <div><dt>Access scope</dt><dd><?= ($drive['scope'] ?? '') === \Bladezux\GoogleDrive::SCOPE_FULL ? 'Full Drive' : 'App files only (drive.file)' ?></dd></div>
        <div><dt>Connected</dt><dd><?= e($drive['connected_at'] ? local_time($drive['connected_at'], 'M j, Y') : '—') ?></dd></div>
        <div><dt>Last sync</dt><dd><?= e($drive['last_sync_at'] ? time_ago($drive['last_sync_at']) : 'never') ?></dd></div>
      </dl>
      <?php if (Auth::isOwner()): ?><a class="btn btn-secondary btn-block" href="<?= e(url('settings.php?tab=drive')) ?>"><?= icon('settings') ?><span>Manage connection</span></a><?php endif; ?>
    </div>
  </article>
</section>
