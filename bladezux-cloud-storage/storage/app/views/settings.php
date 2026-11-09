<?php
use Bladezux\{Auth, Csrf, GoogleDrive, Settings, Mailer};
$tabIcons = ['general' => 'sliders-horizontal', 'account' => 'user', 'drive' => 'cloud', 'email' => 'mail', 'security' => 'shield-check'];
$ownerTabs = ['general', 'email'];
?>
<div class="page-head">
  <div><h1>Settings</h1><p class="muted">Manage your workspace, account, integrations and security.</p></div>
</div>

<?php foreach (\Bladezux\Session::takeFlashes() as $f): ?>
  <div class="alert alert-<?= e($f['type']) ?>"><?= icon($f['type'] === 'success' ? 'circle-check' : ($f['type'] === 'error' ? 'circle-alert' : 'info')) ?><div><?= e($f['message']) ?></div></div>
<?php endforeach; ?>
<?php if ($errors): ?>
  <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?php foreach ($errors as $err): ?><div><?= e($err) ?></div><?php endforeach; ?></div></div>
<?php endif; ?>

<div class="settings-layout">
  <nav class="tabs-vertical" aria-label="Settings sections">
    <?php foreach ($tabs as $key => $label): if (!$isOwner && in_array($key, $ownerTabs, true)) continue; ?>
      <a href="<?= e(url('settings.php?tab=' . $key)) ?>" class="<?= $tab === $key ? 'is-active' : '' ?>" <?= $tab === $key ? 'aria-current="page"' : '' ?>><?= icon($tabIcons[$key]) ?><span><?= e($label) ?></span></a>
    <?php endforeach; ?>
  </nav>

  <div class="settings-panels">
  <?php if ($tab === 'general'): ?>
    <?php if (!$isOwner): ?>
      <div class="card"><div class="card-body"><p class="muted">General settings are managed by the workspace owner.</p></div></div>
    <?php else: ?>
    <form class="card" method="post" enctype="multipart/form-data" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="general">
      <header class="card-head"><div><h2>General</h2><p class="muted">Branding, appearance and regional settings.</p></div></header>
      <div class="card-body form-grid">
        <div class="field span-2">
          <label for="app_name">Application name</label>
          <input id="app_name" name="app_name" required maxlength="80" value="<?= e(Settings::appName()) ?>">
        </div>
        <div class="field">
          <label for="theme">Theme</label>
          <select id="theme" name="theme">
            <?php foreach (['light' => 'Light', 'dark' => 'Dark', 'system' => 'Match system'] as $k => $v): ?>
              <option value="<?= $k ?>" <?= Settings::get('theme') === $k ? 'selected' : '' ?>><?= $v ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="timezone">Timezone</label>
          <select id="timezone" name="timezone">
            <?php $currentTz = Settings::get('timezone', 'UTC'); foreach ($timezones as $tz): ?>
              <option value="<?= e($tz) ?>" <?= $tz === $currentTz ? 'selected' : '' ?>><?= e($tz) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field span-2">
          <label for="logo">Logo</label>
          <div class="logo-row">
            <span class="logo-preview"><?php if ($logo = Settings::get('logo_path')): ?><img src="<?= e(url($logo)) ?>" alt="Current logo"><?php else: ?><?= icon('cloud') ?><?php endif; ?></span>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp">
            <?php if (Settings::get('logo_path')): ?><label class="check"><input type="checkbox" name="remove_logo" value="1"> Remove logo</label><?php endif; ?>
          </div>
          <p class="hint">PNG, JPG or WebP, up to 1 MB. Square images look best.</p>
        </div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('save') ?><span>Save changes</span></button></footer>
    </form>

    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="uploads">
      <header class="card-head"><div><h2>Upload rules</h2><p class="muted">Validation applied before any upload session is created.</p></div></header>
      <div class="card-body form-grid">
        <div class="field">
          <label for="max_upload_mb">Maximum file size (MB)</label>
          <input id="max_upload_mb" name="max_upload_mb" type="number" min="0" step="1" value="<?= (int) ((int) Settings::get('max_upload_bytes', '0') / 1048576) ?>">
          <p class="hint">0 = no app limit (Google Drive's limit of 5 TB per file still applies).</p>
        </div>
        <div class="field">
          <label for="chunk_size_mb">Upload chunk size</label>
          <select id="chunk_size_mb" name="chunk_size_mb">
            <?php foreach ([4, 8, 16, 32, 64, 128] as $c): ?>
              <option value="<?= $c ?>" <?= (int) Settings::get('chunk_size_mb', '16') === $c ? 'selected' : '' ?>><?= $c ?> MB</option>
            <?php endforeach; ?>
          </select>
          <p class="hint">Larger chunks are faster on stable connections; smaller chunks lose less progress on interruption.</p>
        </div>
        <div class="field">
          <label for="duplicate_policy">When a file name already exists</label>
          <select id="duplicate_policy" name="duplicate_policy">
            <?php foreach (['ask' => 'Ask every time', 'rename' => 'Keep both (auto-rename)', 'replace' => 'Replace existing file'] as $k => $v): ?>
              <option value="<?= $k ?>" <?= Settings::get('duplicate_policy') === $k ? 'selected' : '' ?>><?= $v ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field span-2">
          <label for="blocked_extensions">Blocked file extensions</label>
          <textarea id="blocked_extensions" name="blocked_extensions" rows="3"><?= e(Settings::get('blocked_extensions')) ?></textarea>
          <p class="hint">Comma-separated. PHP, PHAR, .htaccess, EXE and shell scripts are always blocked.</p>
        </div>
        <div class="field span-2">
          <p class="label">Hosting limits detected</p>
          <dl class="kv kv-inline">
            <?php foreach ($limits as $k => $v): ?><div><dt><?= e(str_replace('_', ' ', $k)) ?></dt><dd><?= e($v) ?></dd></div><?php endforeach; ?>
          </dl>
          <p class="hint">Direct uploads go from the browser to Google Drive and are not limited by these values. They only affect the fallback relay mode.</p>
        </div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('save') ?><span>Save upload rules</span></button></footer>
    </form>
    <?php endif; ?>

  <?php elseif ($tab === 'account'): ?>
    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="profile">
      <header class="card-head"><div><h2>Profile</h2><p class="muted">Your administrator identity.</p></div>
        <span class="role-chip role-<?= e($user['role']) ?>"><?= e(ucfirst($user['role'])) ?></span></header>
      <div class="card-body form-grid">
        <div class="field"><label for="name">Full name</label><input id="name" name="name" required maxlength="120" value="<?= e($user['name']) ?>"></div>
        <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" required value="<?= e($user['email']) ?>" data-email-original="<?= e($user['email']) ?>"></div>
        <div class="field span-2" data-email-confirm hidden>
          <label for="profile_current_password">Current password</label>
          <input id="profile_current_password" name="current_password" type="password" autocomplete="current-password">
          <p class="hint">Required to change your sign-in email.</p>
        </div>
        <div class="field span-2"><dl class="kv kv-inline">
          <div><dt>Member since</dt><dd><?= e(local_time($user['created_at'], 'M j, Y')) ?></dd></div>
          <div><dt>Last sign-in</dt><dd><?= e(local_time($user['last_login_at'])) ?></dd></div>
          <div><dt>Password changed</dt><dd><?= e($user['password_changed_at'] ? time_ago($user['password_changed_at']) : '—') ?></dd></div>
        </dl></div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('save') ?><span>Save profile</span></button></footer>
    </form>

    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="password">
      <header class="card-head"><div><h2>Change password</h2><p class="muted">Changing your password signs out all your other sessions.</p></div></header>
      <div class="card-body form-grid">
        <div class="field span-2"><label for="current_password">Current password</label><input id="current_password" name="current_password" type="password" required autocomplete="current-password"></div>
        <div class="field"><label for="password">New password</label><input id="password" name="password" type="password" required autocomplete="new-password" data-strength>
          <div class="strength" aria-hidden="true"><span></span></div>
          <p class="hint">At least <?= Auth::MIN_PASSWORD_LENGTH ?> characters with a letter and a number.</p></div>
        <div class="field"><label for="password_confirm">Confirm new password</label><input id="password_confirm" name="password_confirm" type="password" required autocomplete="new-password"></div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('key-round') ?><span>Update password</span></button></footer>
    </form>

  <?php elseif ($tab === 'drive'): ?>
    <?php $connected = $drive['status'] === 'connected'; ?>
    <section class="card">
      <header class="card-head">
        <div><h2>Google Drive connection</h2><p class="muted">Files are stored privately in the connected Google account.</p></div>
        <span class="status-chip is-<?= e($drive['status']) ?>"><span class="dot"></span><?= e(match ($drive['status']) { 'connected' => 'Connected', 'error' => 'Reconnect required', 'disconnected' => 'Disconnected', default => 'Not configured' }) ?></span>
      </header>
      <div class="card-body">
        <?php if ($drive['status'] === 'error'): ?>
          <div class="alert alert-error"><?= icon('circle-alert') ?><div><?= e($drive['last_error'] ?: 'Authorization expired.') ?></div></div>
        <?php endif; ?>
        <div class="drive-overview">
          <dl class="kv">
            <div><dt>Account</dt><dd><?= e($drive['account_name'] ? $drive['account_name'] . ' · ' : '') ?><?= e($drive['account_email'] ?? '—') ?></dd></div>
            <div><dt>App folder</dt><dd><?= $drive['root_folder_id'] ? '“' . e(Settings::appName()) . '” (private)' : '—' ?></dd></div>
            <div><dt>Connected since</dt><dd><?= e(local_time($drive['connected_at'])) ?></dd></div>
            <div><dt>Last sync</dt><dd><?= e($drive['last_sync_at'] ? local_time($drive['last_sync_at']) : 'never') ?></dd></div>
            <div><dt>Files tracked</dt><dd><?= number_format((int) $driveStats['files']) ?> · <?= e(format_bytes((int) $driveStats['bytes'])) ?></dd></div>
          </dl>
          <div class="quota-box">
            <p class="label">Storage</p>
            <?php if ($drive['quota_usage'] !== null): $lim = (int) $drive['quota_limit']; $use = (int) $drive['quota_usage']; ?>
              <p class="quota-figure"><strong><?= e(format_bytes($use)) ?></strong> <?= $lim ? 'of ' . e(format_bytes($lim)) : 'used (unlimited)' ?></p>
              <div class="meter lg"><span style="width: <?= $lim ? min(100, round($use / $lim * 100, 1)) : 0 ?>%"></span></div>
              <p class="hint"><?= $lim ? e(format_bytes(max(0, $lim - $use))) . ' available · ' : '' ?>Updated <?= e(time_ago($drive['quota_updated_at'])) ?></p>
            <?php else: ?>
              <p class="muted">Storage information will appear after connecting.</p>
            <?php endif; ?>
          </div>
        </div>
      </div>
      <?php if ($isOwner): ?>
      <footer class="card-foot wrap">
        <?php if (GoogleDrive::hasCredentials()): ?>
          <form method="post"><?= Csrf::field() ?><input type="hidden" name="action" value="drive_connect">
            <button class="btn btn-primary" type="submit"><?= icon($connected ? 'refresh-ccw' : 'link') ?><span><?= $connected ? 'Reconnect' : ($drive['status'] === 'error' ? 'Reconnect Google Drive' : 'Connect Google Drive') ?></span></button></form>
        <?php endif; ?>
        <?php if ($connected): ?>
          <form method="post" data-busy-form><?= Csrf::field() ?><input type="hidden" name="action" value="drive_sync">
            <button class="btn btn-secondary" type="submit"><?= icon('refresh-cw') ?><span>Sync with Drive</span></button></form>
          <form method="post" data-busy-form><?= Csrf::field() ?><input type="hidden" name="action" value="drive_refresh">
            <button class="btn btn-secondary" type="submit"><?= icon('gauge') ?><span>Refresh storage info</span></button></form>
          <form method="post" data-confirm="Disconnect Google Drive? Uploads and previews stop working until you reconnect. Files stay in Google Drive."><?= Csrf::field() ?><input type="hidden" name="action" value="drive_disconnect">
            <button class="btn btn-ghost danger" type="submit"><?= icon('unlink') ?><span>Disconnect</span></button></form>
        <?php endif; ?>
      </footer>
      <?php endif; ?>
    </section>

    <?php if ($isOwner): ?>
    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="drive_credentials">
      <header class="card-head"><div><h2>OAuth client credentials</h2><p class="muted">From Google Cloud Console → APIs &amp; Services → Credentials (Web application).</p></div></header>
      <div class="card-body form-grid">
        <div class="field span-2">
          <label>Authorized redirect URI</label>
          <div class="copy-field"><input readonly value="<?= e($redirectUri) ?>" id="redirect-uri"><button class="btn btn-secondary" type="button" data-copy="#redirect-uri"><?= icon('copy') ?><span>Copy</span></button></div>
          <p class="hint">Add this exact URI to the OAuth client. Also add <code><?= e(\Bladezux\App::origin()) ?></code> as an Authorized JavaScript origin.</p>
        </div>
        <div class="field span-2"><label for="client_id">Client ID</label><input id="client_id" name="client_id" required value="<?= e($drive['client_id'] ?? '') ?>" placeholder="1234567890-abc.apps.googleusercontent.com" spellcheck="false"></div>
        <div class="field span-2"><label for="client_secret">Client secret</label>
          <input id="client_secret" name="client_secret" type="password" autocomplete="off" placeholder="<?= GoogleDrive::hasCredentials() ? 'Saved — leave blank to keep the current secret' : 'GOCSPX-…' ?>">
          <p class="hint">Stored encrypted (AES-256-GCM). Never sent to the browser.</p></div>
        <div class="field span-2">
          <p class="label">Access scope</p>
          <label class="radio-card"><input type="radio" name="scope" value="file" <?= ($drive['scope'] ?? GoogleDrive::SCOPE_FILE) !== GoogleDrive::SCOPE_FULL ? 'checked' : '' ?>>
            <span><strong>App files only</strong> <span class="pill">Recommended</span><small>drive.file — the app can only see files and folders it created. No Google verification required.</small></span></label>
          <label class="radio-card"><input type="radio" name="scope" value="full" <?= ($drive['scope'] ?? '') === GoogleDrive::SCOPE_FULL ? 'checked' : '' ?>>
            <span><strong>Full Drive access</strong><small>drive — lets "Sync with Drive" import files added to the app folder from Google Drive directly. Restricted scope; requires Google verification for external users.</small></span></label>
          <p class="hint">Changing the scope requires reconnecting.</p>
        </div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('save') ?><span>Save credentials</span></button></footer>
    </form>
    <?php endif; ?>

  <?php elseif ($tab === 'email'): ?>
    <?php if ($isOwner): ?>
    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="smtp">
      <header class="card-head"><div><h2>SMTP delivery</h2><p class="muted">Send email through an existing cPanel mailbox (e.g. no-reply@yourdomain.com).</p></div>
        <span class="status-chip <?= Mailer::isConfigured() ? 'is-connected' : 'is-disconnected' ?>"><span class="dot"></span><?= Mailer::isConfigured() ? 'Configured' : 'Not configured' ?></span></header>
      <div class="card-body form-grid">
        <div class="field"><label for="smtp_host">SMTP host</label><input id="smtp_host" name="smtp_host" required value="<?= e(Settings::get('smtp_host')) ?>" placeholder="mail.yourdomain.com"></div>
        <div class="field"><label for="smtp_port">Port</label><input id="smtp_port" name="smtp_port" type="number" required value="<?= e(Settings::get('smtp_port', '465')) ?>"></div>
        <div class="field"><label for="smtp_encryption">Encryption</label>
          <select id="smtp_encryption" name="smtp_encryption" data-port-target="#smtp_port">
            <?php foreach (['ssl' => 'SSL/TLS (port 465)', 'tls' => 'STARTTLS (port 587)', 'none' => 'None (not recommended)'] as $k => $v): ?>
              <option value="<?= $k ?>" <?= Settings::get('smtp_encryption') === $k ? 'selected' : '' ?>><?= $v ?></option>
            <?php endforeach; ?>
          </select></div>
        <div class="field"><label for="smtp_username">Username</label><input id="smtp_username" name="smtp_username" autocomplete="off" value="<?= e(Settings::get('smtp_username')) ?>" placeholder="no-reply@yourdomain.com"></div>
        <div class="field span-2"><label for="smtp_password">Password</label><input id="smtp_password" name="smtp_password" type="password" autocomplete="new-password" placeholder="<?= Settings::get('smtp_password') ? 'Saved — leave blank to keep the current password' : 'Mailbox password' ?>">
          <p class="hint">The mailbox password from cPanel → Email Accounts. Stored encrypted; separate from your admin login.</p></div>
        <div class="field"><label for="smtp_from_email">Sender email</label><input id="smtp_from_email" name="smtp_from_email" type="email" required value="<?= e(Settings::get('smtp_from_email')) ?>"></div>
        <div class="field"><label for="smtp_from_name">Sender name</label><input id="smtp_from_name" name="smtp_from_name" maxlength="100" value="<?= e(Settings::get('smtp_from_name')) ?>"></div>
      </div>
      <footer class="card-foot"><button class="btn btn-primary" type="submit"><?= icon('save') ?><span>Save SMTP settings</span></button></footer>
    </form>
    <form class="card" method="post" data-busy-form>
      <?= Csrf::field() ?><input type="hidden" name="action" value="smtp_test">
      <header class="card-head"><div><h2>Send a test email</h2><p class="muted">Verifies the connection, authentication and delivery.</p></div></header>
      <div class="card-body form-inline">
        <div class="field grow"><label for="test_email">Recipient</label><input id="test_email" name="test_email" type="email" value="<?= e($user['email']) ?>"></div>
        <button class="btn btn-secondary" type="submit" <?= Mailer::isConfigured() ? '' : 'disabled' ?>><?= icon('send') ?><span>Send test</span></button>
      </div>
    </form>
    <?php endif; ?>

  <?php elseif ($tab === 'security'): ?>
    <section class="card">
      <header class="card-head"><div><h2>Active sessions</h2><p class="muted"><?= $isOwner ? 'All signed-in administrators.' : 'Devices signed in to your account.' ?></p></div>
        <form method="post"><?= Csrf::field() ?><input type="hidden" name="action" value="revoke_others"><button class="btn btn-secondary" type="submit"><?= icon('log-out') ?><span>Sign out my other sessions</span></button></form></header>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><?php if ($isOwner): ?><th>Administrator</th><?php endif; ?><th>Device</th><th>IP address</th><th>Signed in</th><th>Last active</th><th></th></tr></thead>
          <tbody>
          <?php foreach ($sessions as $s): $current = (int) $s['id'] === (int) $user['session_row_id']; ?>
            <tr>
              <?php if ($isOwner): ?><td><?= e($s['admin_name']) ?></td><?php endif; ?>
              <td><?= icon('monitor-smartphone') ?> <?= e(user_agent_label($s['user_agent'])) ?> <?= $current ? '<span class="pill">This device</span>' : '' ?></td>
              <td class="mono"><?= e($s['ip_address']) ?></td>
              <td><?= e(local_time($s['created_at'])) ?></td>
              <td><?= e(time_ago($s['last_activity_at'])) ?></td>
              <td class="t-right"><?php if (!$current): ?>
                <form method="post"><?= Csrf::field() ?><input type="hidden" name="action" value="revoke_session"><input type="hidden" name="session_id" value="<?= (int) $s['id'] ?>">
                  <button class="btn btn-ghost sm danger" type="submit">Sign out</button></form><?php endif; ?></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <header class="card-head"><div><h2>Login history</h2><p class="muted">Most recent 30 sign-in attempts.</p></div></header>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Result</th><?php if ($isOwner): ?><th>Account</th><?php endif; ?><th>Device</th><th>IP address</th><th>Time</th></tr></thead>
          <tbody>
          <?php if (!$logins): ?><tr><td colspan="5" class="muted">No sign-in attempts recorded.</td></tr><?php endif; ?>
          <?php foreach ($logins as $l): ?>
            <tr>
              <td><?= (int) $l['success'] ? '<span class="tag tag-success">Success</span>' : '<span class="tag tag-danger">Failed</span>' ?></td>
              <?php if ($isOwner): ?><td><?= e($l['admin_name'] ?? 'Unknown account') ?></td><?php endif; ?>
              <td><?= e(user_agent_label($l['user_agent'])) ?></td>
              <td class="mono"><?= e($l['ip_address']) ?></td>
              <td><?= e(local_time($l['created_at'])) ?></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <header class="card-head"><div><h2>Your recent activity</h2></div><?php if ($isOwner): ?><a class="link-sm" href="<?= e(url('activity.php')) ?>">Full activity log</a><?php endif; ?></header>
      <div class="card-body flush">
        <ul class="timeline">
          <?php foreach ($activity as $a): ?>
            <li><span class="timeline-icon"><?= icon(\Bladezux\Activity::icon($a['action'])) ?></span><div><p><?= e($a['description']) ?></p><small class="muted"><?= e(local_time($a['created_at'])) ?> · <?= e($a['ip_address']) ?></small></div></li>
          <?php endforeach; ?>
          <?php if (!$activity): ?><li class="muted">No activity yet.</li><?php endif; ?>
        </ul>
      </div>
    </section>
  <?php endif; ?>
  </div>
</div>
