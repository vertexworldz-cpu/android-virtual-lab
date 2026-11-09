<?php use Bladezux\Activity; ?>
<div class="page-head">
  <div><h1>Activity log</h1><p class="muted"><?= number_format($total) ?> recorded event(s). Every sign-in, upload and change is audited.</p></div>
</div>
<form class="toolbar" method="get">
  <div class="toolbar-left">
    <div class="search-inline"><?= icon('search') ?><input type="search" name="q" value="<?= e($filters['q']) ?>" placeholder="Search descriptions" aria-label="Search activity"></div>
    <label class="select-wrap"><span class="sr-only">Administrator</span><select name="admin"><option value="">All administrators</option>
      <?php foreach ($admins as $a): ?><option value="<?= (int) $a['id'] ?>" <?= $filters['admin'] === (int) $a['id'] ? 'selected' : '' ?>><?= e($a['name']) ?></option><?php endforeach; ?></select></label>
    <label class="select-wrap"><span class="sr-only">Event type</span><select name="type"><option value="">All events</option>
      <?php foreach (['file' => 'Files', 'folder' => 'Folders', 'auth' => 'Authentication', 'admin' => 'Accounts', 'drive' => 'Google Drive', 'settings' => 'Settings'] as $k => $v): ?>
        <option value="<?= $k ?>" <?= $filters['type'] === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></label>
    <button class="btn btn-secondary" type="submit"><?= icon('filter') ?><span>Filter</span></button>
  </div>
</form>
<section class="card">
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Event</th><th>Administrator</th><th>IP address</th><th>Time</th></tr></thead>
      <tbody>
        <?php if (!$logs): ?><tr><td colspan="4"><div class="empty-mini-block"><?= icon('activity') ?><p>No matching activity.</p></div></td></tr><?php endif; ?>
        <?php foreach ($logs as $l): ?>
          <tr>
            <td><div class="event"><span class="timeline-icon"><?= icon(Activity::icon($l['action'])) ?></span><div><?= e($l['description']) ?><small class="muted d-block mono"><?= e($l['action']) ?></small></div></div></td>
            <td><?= e($l['admin_name'] ?? 'System') ?></td>
            <td class="mono"><?= e($l['ip_address']) ?></td>
            <td title="<?= e(local_time($l['created_at'])) ?>"><?= e(local_time($l['created_at'], 'M j, Y H:i')) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php if ($pages > 1): ?>
    <footer class="card-foot pager">
      <?php $qs = static fn ($p) => '?' . http_build_query(array_filter($filters + ['page' => $p])); ?>
      <a class="btn btn-secondary sm <?= $page <= 1 ? 'is-disabled' : '' ?>" href="<?= e($qs(max(1, $page - 1))) ?>"><?= icon('chevron-left') ?><span>Previous</span></a>
      <span class="muted">Page <?= $page ?> of <?= $pages ?></span>
      <a class="btn btn-secondary sm <?= $page >= $pages ? 'is-disabled' : '' ?>" href="<?= e($qs(min($pages, $page + 1))) ?>"><span>Next</span><?= icon('chevron-right') ?></a>
    </footer>
  <?php endif; ?>
</section>
