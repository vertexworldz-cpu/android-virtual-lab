<?php use Bladezux\Csrf; ?>
<?php if ($sent): ?>
  <div class="auth-head">
    <span class="state-icon is-success"><?= icon('mail-check') ?></span>
    <h1>Check your inbox</h1>
    <p class="muted">If an active account exists for that address, we have sent a password reset link. The link expires in 30 minutes and works only once.</p>
  </div>
  <a class="btn btn-secondary btn-block" href="<?= e(url('login.php')) ?>"><?= icon('arrow-left') ?><span>Back to sign in</span></a>
<?php else: ?>
  <div class="auth-head">
    <h1>Forgot your password?</h1>
    <p class="muted">Enter your account email and we will send you a secure reset link.</p>
  </div>
  <?php if ($error): ?>
    <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?= e($error) ?></div></div>
  <?php endif; ?>
  <form method="post" class="form" novalidate data-busy-form>
    <?= Csrf::field() ?>
    <div class="field">
      <label for="email">Email address</label>
      <div class="input-icon"><?= icon('mail') ?><input id="email" name="email" type="email" required autocomplete="email" autofocus></div>
    </div>
    <button class="btn btn-primary btn-block btn-lg" type="submit"><span>Send reset link</span><?= icon('send') ?></button>
  </form>
  <p class="auth-foot"><a href="<?= e(url('login.php')) ?>"><?= icon('arrow-left') ?> Back to sign in</a></p>
<?php endif; ?>
