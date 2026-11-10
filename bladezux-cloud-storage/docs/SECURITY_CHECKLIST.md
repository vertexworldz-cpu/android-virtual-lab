# Post-Install Security Checklist

Work through this list after installing. Each item has a quick way to verify it.

## Server & files

- [ ] **`storage/install/` deleted.** `https://yourdomain.com/storage/install/` returns 404.
- [ ] **Private folder is outside `public_html`.** Settings → General shows the app works; `config.php` lives in
      `/home/CPANELUSER/bladezux-private/`. Permissions: folder `0750`, `config.php` `0640` (or `0600`).
- [ ] **Internal code is not reachable.** `https://yourdomain.com/storage/app/bootstrap.php` and
      `https://yourdomain.com/storage/app/vendor/phpmailer/PHPMailer.php` return **403**.
- [ ] **Hidden files uploaded.** `storage/.htaccess`, `storage/app/.htaccess`, `storage/uploads/.htaccess` exist.
- [ ] **No directory listing.** `https://yourdomain.com/storage/assets/` returns 403.
- [ ] **Scripts cannot run in uploads.** Branding uploads accept only PNG/JPG/WebP, and `uploads/.htaccess`
      disables PHP. (Company files are stored in Google Drive, never on the web server.)
- [ ] **HTTPS enforced.** `http://yourdomain.com/storage/login.php` redirects to `https://`; response has
      `Strict-Transport-Security`.
- [ ] **Backups.** Include the database and the private folder (it holds `app.key`) in cPanel backups.

## Application

- [ ] **Owner password** is long and unique; consider a password manager.
- [ ] **Public sign-up closed.** `https://yourdomain.com/storage/signup.php` says *Registration is invite-only*.
- [ ] **SMTP test email** received; SPF/DKIM pass (cPanel → Email Deliverability).
- [ ] **Password reset** works end-to-end and the link expires (30 min) and cannot be reused.
- [ ] **Google OAuth app** is *Internal* (Workspace) or *Published* (External) so tokens don't expire after 7 days.
- [ ] **Scope** is `drive.file` unless you need full-Drive sync.
- [ ] **Drive folder is private.** In Google Drive, the *Bladezux Cloud Storage* folder shows *Only you* /
      restricted sharing. Never share it publicly.
- [ ] **Administrators** — only people who need access; remove pending invitations you no longer need.
- [ ] **Upload rules** — review blocked extensions and the maximum file size.
- [ ] **Timezone** set correctly (Settings → General) so logs read correctly.

## Ongoing

- [ ] Review **Activity log** and **Settings → Security → Login history** regularly (failed sign-ins appear there).
- [ ] Sign out stale sessions (Settings → Security).
- [ ] Keep PHP updated (cPanel → Select PHP Version).
- [ ] Check `bladezux-private/logs/` for repeated errors.
- [ ] Rotate the OAuth client secret if an owner leaves: Google Cloud → Credentials → reset secret → re-enter it
      in Settings → Google Drive → Reconnect.
- [ ] If you suspect compromise: change all admin passwords (signs out sessions), disconnect + reconnect Google
      Drive, reset the OAuth client secret and the SMTP mailbox password.

## What the application enforces

| Control | Implementation |
|---|---|
| SQL injection | PDO prepared statements everywhere, emulated prepares off |
| XSS | Output escaping in templates, DOM `textContent` in JS, strict CSP (`script-src 'self'`) |
| CSRF | Per-session token on every form and on every API mutation (`X-CSRF-Token`) |
| Session security | Strict mode, HttpOnly, Secure (HTTPS), SameSite=Lax, ID regeneration at login, server-side session registry (revocation), idle + absolute timeouts |
| Passwords | `password_hash()` (bcrypt), `password_verify()`, automatic rehash, minimum policy |
| Brute force | Per-account and per-IP lockout, constant-time verification for unknown accounts |
| Reset tokens | 256-bit random, only SHA-256 hash stored, 30-min expiry, single use, all sessions revoked on reset |
| User enumeration | Identical responses for known/unknown accounts on reset requests |
| Secrets at rest | AES-256-GCM for OAuth tokens, client secret, upload session URIs, SMTP password |
| Secrets in transit to browser | None: the browser only receives a single-file upload session URI |
| OAuth | `state` (CSRF) + PKCE S256, bound to the signed-in owner, 10-minute validity |
| Upload validation | Extension blocklist (incl. double extensions), magic-byte sniffing (`finfo`) of the first bytes, image/PDF signature checks, size and quota checks, safe name normalisation |
| Downloads | Authenticated streaming only; `Content-Disposition: attachment` except for previewable types; `nosniff`; sandboxed CSP |
| Error handling | Generic messages with a reference ID; details (with tokens redacted) only in private logs |
| Clickjacking | `X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'` |
