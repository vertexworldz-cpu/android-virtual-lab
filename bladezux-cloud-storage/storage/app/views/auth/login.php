<?php use Bladezux\Csrf; ?>
<div class="auth-head">
  <h1>Welcome back</h1>
  <p class="muted">Sign in to your private storage workspace.</p>
</div>
<?php if ($error): ?>
  <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?= e($error) ?></div></div>
<?php endif; ?>
<form method="post" class="form" novalidate data-busy-form>
  <?= Csrf::field() ?>
  <div class="field">
    <label for="email">Email address</label>
    <div class="input-icon"><?= icon('mail') ?><input id="email" name="email" type="email" autocomplete="username" required value="<?= e($email) ?>" autofocus></div>
  </div>
  <div class="field">
    <div class="field-row"><label for="password">Password</label><a class="link-sm" href="<?= e(url('forgot-password.php')) ?>">Forgot password?</a></div>
    <div class="input-icon"><?= icon('lock') ?><input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="button" class="input-toggle" data-toggle-password aria-label="Show password"><?= icon('eye') ?></button></div>
  </div>
  <button class="btn btn-primary btn-block btn-lg" type="submit"><span>Sign in</span><?= icon('arrow-right') ?></button>
</form>
<p class="auth-foot muted">Access is restricted to authorised administrators. New accounts are created by the workspace owner.</p>
