<?php
use Bladezux\Settings;
$appName = 'Bladezux Cloud Storage';
try { $appName = Settings::appName(); } catch (\Throwable) {}
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e(($title ?? 'Sign in') . ' · ' . $appName) ?></title>
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
</head>
<body class="auth-body">
<div class="auth-wrap">
  <section class="auth-aside" aria-hidden="true">
    <div class="auth-aside-inner">
      <div class="brand brand-light">
        <span class="brand-mark"><?= icon('cloud') ?></span>
        <span class="brand-text"><strong>BLADEZUX</strong><small>Cloud Storage</small></span>
      </div>
      <div class="auth-pitch">
        <h2>Your company files, private and organised.</h2>
        <p>Secure storage backed by Google Drive with resumable uploads for very large files.</p>
        <ul class="auth-points">
          <li><?= icon('shield-check') ?> Private by default — nothing is shared publicly</li>
          <li><?= icon('cloud-upload') ?> Resumable uploads that survive network drops</li>
          <li><?= icon('folder-tree') ?> Folders, previews and fast search</li>
        </ul>
      </div>
      <p class="auth-aside-foot">&copy; <?= date('Y') ?> Bladezux</p>
    </div>
  </section>
  <main class="auth-main">
    <div class="auth-card">
      <div class="brand brand-compact">
        <span class="brand-mark"><?= icon('cloud') ?></span>
        <span class="brand-text"><strong>BLADEZUX</strong><small>Cloud Storage</small></span>
      </div>
      <?php foreach (\Bladezux\Session::takeFlashes() as $f): ?>
        <div class="alert alert-<?= e($f['type']) ?>"><?= icon($f['type'] === 'success' ? 'circle-check' : ($f['type'] === 'error' ? 'circle-alert' : 'info')) ?><div><?= e($f['message']) ?></div></div>
      <?php endforeach; ?>
      <?= $content ?>
    </div>
  </main>
</div>
<script src="<?= e(asset('js/auth.js')) ?>"></script>
</body>
</html>
