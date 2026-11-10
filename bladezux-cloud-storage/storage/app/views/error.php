<div class="auth-head">
  <span class="state-icon is-danger"><?= icon($status === 403 ? 'lock' : ($status === 419 ? 'clock' : 'triangle-alert')) ?></span>
  <h1><?= e($title) ?></h1>
  <p class="muted"><?= e($message) ?></p>
</div>
<a class="btn btn-primary btn-block" href="<?= e(url('dashboard.php')) ?>">Back to dashboard</a>
