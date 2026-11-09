<?php use Bladezux\{Auth, Csrf}; ?>
<?php if ($state !== 'valid'): ?>
  <div class="auth-head">
    <span class="state-icon is-danger"><?= icon('link-2-off') ?></span>
    <h1><?= $state === 'expired' ? 'This reset link has expired' : ($state === 'used' ? 'This reset link was already used' : 'Invalid reset link') ?></h1>
    <p class="muted">For your security, reset links expire after 30 minutes and can only be used once. Request a new link to continue.</p>
  </div>
  <a class="btn btn-primary btn-block" href="<?= e(url('forgot-password.php')) ?>">Request a new link</a>
  <p class="auth-foot"><a href="<?= e(url('login.php')) ?>"><?= icon('arrow-left') ?> Back to sign in</a></p>
<?php else: ?>
  <div class="auth-head">
    <h1>Choose a new password</h1>
    <p class="muted">Resetting the password for <strong><?= e($row['email']) ?></strong>. All other sessions will be signed out.</p>
  </div>
  <?php if ($error): ?>
    <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?= e($error) ?></div></div>
  <?php endif; ?>
  <form method="post" class="form" novalidate data-busy-form>
    <?= Csrf::field() ?>
    <input type="hidden" name="token" value="<?= e($token) ?>">
    <div class="field">
      <label for="password">New password</label>
      <div class="input-icon"><?= icon('lock') ?><input id="password" name="password" type="password" required autocomplete="new-password" data-strength autofocus>
        <button type="button" class="input-toggle" data-toggle-password aria-label="Show password"><?= icon('eye') ?></button></div>
      <div class="strength" aria-hidden="true"><span></span></div>
      <p class="hint">At least <?= Auth::MIN_PASSWORD_LENGTH ?> characters, including a letter and a number.</p>
    </div>
    <div class="field">
      <label for="password_confirm">Confirm new password</label>
      <div class="input-icon"><?= icon('lock') ?><input id="password_confirm" name="password_confirm" type="password" required autocomplete="new-password"></div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" type="submit"><span>Reset password</span><?= icon('check') ?></button>
  </form>
<?php endif; ?>
