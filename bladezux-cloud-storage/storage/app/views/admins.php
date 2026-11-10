<?php use Bladezux\{Auth, Csrf}; ?>
<div class="page-head">
  <div><h1>Administrators</h1><p class="muted">Control who can access this private storage workspace.</p></div>
  <div class="page-actions"><button class="btn btn-primary" type="button" data-open-dialog="#dlg-create"><?= icon('user-plus') ?><span>Add administrator</span></button></div>
</div>

<?php foreach (\Bladezux\Session::takeFlashes() as $f): ?>
  <div class="alert alert-<?= e($f['type']) ?>"><?= icon($f['type'] === 'success' ? 'circle-check' : 'triangle-alert') ?><div><?= e($f['message']) ?></div></div>
<?php endforeach; ?>
<?php if ($inviteLink): ?>
  <div class="alert alert-info"><?= icon('link') ?><div><strong>Activation link for <?= e($inviteLink['email']) ?></strong> (valid 48 hours, shown once):
    <div class="copy-field mt"><input readonly id="invite-link" value="<?= e($inviteLink['link']) ?>"><button class="btn btn-secondary" type="button" data-copy="#invite-link"><?= icon('copy') ?><span>Copy</span></button></div></div></div>
<?php endif; ?>
<?php if ($errors): ?>
  <div class="alert alert-error" role="alert"><?= icon('circle-alert') ?><div><?php foreach ($errors as $err): ?><div><?= e($err) ?></div><?php endforeach; ?></div></div>
<?php endif; ?>

<section class="card">
  <div class="table-wrap">
    <table class="table table-admins">
      <thead><tr><th>Administrator</th><th>Role</th><th>Status</th><th>Files</th><th>Last sign-in</th><th class="t-right">Actions</th></tr></thead>
      <tbody>
      <?php foreach ($admins as $a): $self = (int) $a['id'] === (int) $user['id']; ?>
        <tr>
          <td><div class="person"><span class="avatar sm"><?= e(initials($a['name'])) ?></span><div><strong><?= e($a['name']) ?></strong><?= $self ? ' <span class="pill">You</span>' : '' ?><small class="muted d-block"><?= e($a['email']) ?></small></div></div></td>
          <td><span class="role-chip role-<?= e($a['role']) ?>"><?= e(ucfirst($a['role'])) ?></span></td>
          <td><span class="tag tag-<?= $a['status'] === 'active' ? 'success' : ($a['status'] === 'pending' ? 'warning' : 'muted') ?>"><?= e($a['status'] === 'pending' ? 'Invitation pending' : ucfirst($a['status'])) ?></span></td>
          <td><?= number_format((int) $a['file_count']) ?></td>
          <td><?= e($a['last_login_at'] ? time_ago($a['last_login_at']) : 'never') ?><?= (int) $a['session_count'] > 0 ? '<small class="muted d-block">' . (int) $a['session_count'] . ' active session(s)</small>' : '' ?></td>
          <td class="t-right">
            <div class="row-actions">
              <button class="btn btn-ghost sm" type="button" data-open-dialog="#dlg-edit-<?= (int) $a['id'] ?>"><?= icon('pencil') ?><span>Edit</span></button>
              <?php if ($a['status'] === 'pending'): ?>
                <form method="post"><?= Csrf::field() ?><input type="hidden" name="action" value="resend"><input type="hidden" name="id" value="<?= (int) $a['id'] ?>">
                  <button class="btn btn-ghost sm" type="submit"><?= icon('send') ?><span>Resend</span></button></form>
              <?php elseif (!$self): ?>
                <form method="post" data-confirm="<?= $a['status'] === 'active' ? 'Disable this account? The administrator will be signed out immediately.' : 'Enable this account?' ?>"><?= Csrf::field() ?><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="<?= (int) $a['id'] ?>">
                  <button class="btn btn-ghost sm" type="submit"><?= icon($a['status'] === 'active' ? 'user-x' : 'user-check') ?><span><?= $a['status'] === 'active' ? 'Disable' : 'Enable' ?></span></button></form>
              <?php endif; ?>
              <?php if (!$self): ?>
                <button class="btn btn-ghost sm danger" type="button" data-open-dialog="#dlg-delete-<?= (int) $a['id'] ?>"><?= icon('trash-2') ?><span>Delete</span></button>
              <?php endif; ?>
            </div>

            <dialog class="dialog" id="dlg-edit-<?= (int) $a['id'] ?>">
              <form method="post" class="dialog-body">
                <?= Csrf::field() ?><input type="hidden" name="action" value="update"><input type="hidden" name="id" value="<?= (int) $a['id'] ?>">
                <h3>Edit administrator</h3>
                <div class="field"><label>Full name</label><input name="name" required maxlength="120" value="<?= e($a['name']) ?>"></div>
                <div class="field"><label>Email</label><input value="<?= e($a['email']) ?>" readonly></div>
                <div class="field"><label>Role</label>
                  <select name="role" <?= $self ? 'disabled' : '' ?>><option value="admin" <?= $a['role'] === 'admin' ? 'selected' : '' ?>>Admin — manage files</option><option value="owner" <?= $a['role'] === 'owner' ? 'selected' : '' ?>>Owner — full control</option></select>
                  <?php if ($self): ?><input type="hidden" name="role" value="owner"><?php endif; ?></div>
                <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
              </form>
            </dialog>
            <?php if (!$self): ?>
            <dialog class="dialog" id="dlg-delete-<?= (int) $a['id'] ?>">
              <form method="post" class="dialog-body">
                <?= Csrf::field() ?><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?= (int) $a['id'] ?>">
                <h3>Delete <?= e($a['name']) ?>?</h3>
                <p class="muted">The account is removed permanently and signed out everywhere. Files they uploaded are kept.</p>
                <div class="field"><label>Type <strong><?= e($a['email']) ?></strong> to confirm</label><input name="confirm_email" required autocomplete="off"></div>
                <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-danger" type="submit">Delete account</button></div>
              </form>
            </dialog>
            <?php endif; ?>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>

<dialog class="dialog" id="dlg-create" <?= $errors && $old['email'] !== '' ? 'data-open-on-load' : '' ?>>
  <form method="post" class="dialog-body" data-busy-form>
    <?= Csrf::field() ?><input type="hidden" name="action" value="create">
    <h3>Add administrator</h3>
    <p class="muted">New administrators can upload, organise, preview and download files.</p>
    <div class="field"><label for="c-name">Full name</label><input id="c-name" name="name" required maxlength="120" value="<?= e($old['name']) ?>"></div>
    <div class="field"><label for="c-email">Email address</label><input id="c-email" name="email" type="email" required value="<?= e($old['email']) ?>"></div>
    <div class="field"><label for="c-role">Role</label>
      <select id="c-role" name="role"><option value="admin" <?= $old['role'] === 'admin' ? 'selected' : '' ?>>Admin — manage files</option><option value="owner" <?= $old['role'] === 'owner' ? 'selected' : '' ?>>Owner — full control</option></select></div>
    <div class="field">
      <p class="label">Activation</p>
      <label class="radio-card"><input type="radio" name="method" value="invite" <?= $old['method'] !== 'password' ? 'checked' : '' ?> data-toggle-target="#c-password-fields" data-toggle-show="0">
        <span><strong>Send invitation email</strong><small>They choose their own password via a link valid for 48 hours.</small></span></label>
      <label class="radio-card"><input type="radio" name="method" value="password" <?= $old['method'] === 'password' ? 'checked' : '' ?> data-toggle-target="#c-password-fields" data-toggle-show="1">
        <span><strong>Set an initial password</strong><small>Share it securely; they should change it after signing in.</small></span></label>
    </div>
    <div id="c-password-fields" <?= $old['method'] === 'password' ? '' : 'hidden' ?>>
      <div class="field"><label for="c-pass">Initial password</label><input id="c-pass" name="password" type="password" autocomplete="new-password" data-strength><div class="strength"><span></span></div></div>
      <div class="field"><label for="c-pass2">Confirm password</label><input id="c-pass2" name="password_confirm" type="password" autocomplete="new-password"></div>
    </div>
    <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-primary" type="submit"><?= icon('user-plus') ?><span>Create account</span></button></div>
  </form>
</dialog>
