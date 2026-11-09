<?php use Bladezux\{Auth, Csrf}; ?>
<?php if ($mode === 'closed' || $mode === 'invite_invalid'): ?>
  <div class="auth-head">
    <span class="state-icon"><?= icon('lock') ?></span>
    <h1><?= $mode === 'closed' ? 'Registration is invite-only' : 'Invitation link not valid' ?></h1>
    <p class="muted">
      <?= $mode === 'closed'
        ? 'Public sign-up is disabled for this private workspace. Ask the workspace owner to create an administrator account for you.'
        : 'This invitation link has expired, was already used, or is invalid. Ask the workspace owner to send a new invitation.' ?>
    </p>
  </div>
  <a class="btn btn-primary btn-block" href="<?= e(url('login.php')) ?>">Go to sign in</a>
<?php else: ?>
  <div class="auth-head">
    <?php if ($mode === 'owner'): ?>
      <span class="eyebrow">Initial setup</span>
      <h1>Create the owner account</h1>
      <p class="muted">The owner has full control of the workspace, Google Drive connection and administrator accounts.</p>
    <?php else: ?>
      <span class="eyebrow">Invitation</span>
      <h1>Activate your account</h1>
      <p class="muted">Choose a password to finish setting up <strong><?= e($invite['email']) ?></strong>.</p>
    <?php endif; ?>
  </div>
  <?php if ($errors): ?>
    <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?php foreach ($errors as $err): ?><div><?= e($err) ?></div><?php endforeach; ?></div></div>
  <?php endif; ?>
  <form method="post" class="form" novalidate data-busy-form>
    <?= Csrf::field() ?>
    <input type="hidden" name="invite" value="<?= e($inviteToken) ?>">
    <div class="field">
      <label for="name">Full name</label>
      <div class="input-icon"><?= icon('user') ?><input id="name" name="name" required maxlength="120" autocomplete="name" value="<?= e($old['name'] ?: ($invite['name'] ?? '')) ?>"></div>
    </div>
    <div class="field">
      <label for="email">Email address</label>
      <div class="input-icon"><?= icon('mail') ?><input id="email" name="email" type="email" required autocomplete="email" value="<?= e($mode === 'invite' ? $invite['email'] : $old['email']) ?>" <?= $mode === 'invite' ? 'readonly' : '' ?>></div>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <div class="input-icon"><?= icon('lock') ?><input id="password" name="password" type="password" required autocomplete="new-password" minlength="<?= Auth::MIN_PASSWORD_LENGTH ?>" data-strength>
        <button type="button" class="input-toggle" data-toggle-password aria-label="Show password"><?= icon('eye') ?></button></div>
      <div class="strength" aria-hidden="true"><span></span></div>
      <p class="hint">At least <?= Auth::MIN_PASSWORD_LENGTH ?> characters, including a letter and a number.</p>
    </div>
    <div class="field">
      <label for="password_confirm">Confirm password</label>
      <div class="input-icon"><?= icon('lock') ?><input id="password_confirm" name="password_confirm" type="password" required autocomplete="new-password"></div>
    </div>
    <?php if ($mode === 'owner'): ?>
      <div class="field">
        <label for="setup_key">Setup key</label>
        <div class="input-icon"><?= icon('key-round') ?><input id="setup_key" name="setup_key" required autocomplete="off" spellcheck="false"></div>
        <p class="hint">Found as <code>setup_key</code> in your private <code>config.php</code>. It protects the first-time owner setup.</p>
      </div>
    <?php endif; ?>
    <button class="btn btn-primary btn-block btn-lg" type="submit"><span><?= $mode === 'owner' ? 'Create owner account' : 'Activate account' ?></span><?= icon('arrow-right') ?></button>
  </form>
  <?php if ($mode === 'owner'): ?><p class="auth-foot muted">Already set up? <a href="<?= e(url('login.php')) ?>">Sign in</a></p><?php endif; ?>
<?php endif; ?>
