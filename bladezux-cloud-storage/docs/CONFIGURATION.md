# Configuration Guide

## Private configuration file

Location (searched in this order):

1. The folder in the `BLADEZUX_PRIVATE_DIR` environment variable (optional).
2. `/home/CPANELUSER/bladezux-private/config.php` — i.e. a sibling of `public_html` (**recommended**).
3. `public_html/storage/app/private/config.php` — fallback only; protected by `storage/app/.htaccess`.

The installer writes this file. Template: [`private/config.sample.php`](../private/config.sample.php).

| Key | Meaning |
|---|---|
| `app.base_url` | Public URL of the app without trailing slash, e.g. `https://yourdomain.com/storage`. Used for email links, the OAuth redirect URI and the upload `Origin`. |
| `app.key` | Base64-encoded 32-byte key. Encrypts OAuth tokens, the OAuth client secret, upload session URIs and the SMTP password (AES-256-GCM). **Back it up.** Changing it makes stored secrets unreadable (reconnect Drive and re-enter SMTP password). |
| `app.setup_key` | One-time key for `signup.php` owner creation on manual installs. |
| `app.force_https` | `true` = redirect HTTP→HTTPS and send HSTS. Keep `true` in production. |
| `app.trust_proxy` | `true` only behind a trusted proxy/CDN (e.g. Cloudflare) so `X-Forwarded-Proto/For` are honoured. |
| `db.*` | MySQL host, port, name, user, pass (optional `socket`). |
| `paths.logs` | Writable folder for application logs (outside `public_html`). |
| `google.endpoints.*` | **Testing only.** Overrides Google endpoint URLs (used by the automated test-suite's mock server). Do not set in production. |

## In-app settings (owner only)

**Settings → General**

- Application name, logo (PNG/JPG/WebP ≤ 1 MB), theme (light / dark / system), timezone (all dates are stored
  in UTC and displayed in this timezone).
- Upload rules: maximum file size (0 = only Google's 5 TB limit), chunk size (4–128 MB), duplicate-name policy
  (ask / keep both / replace), blocked extensions (PHP, PHAR, `.htaccess`, EXE and shell scripts are always blocked).
- A read-out of the detected PHP limits and the resulting relay chunk size.

**Settings → Account** — name, email (requires current password), password change (signs out other sessions).

**Settings → Google Drive** — OAuth credentials, scope, connect / reconnect / disconnect, *Sync with Drive*,
*Refresh storage info*.

**Settings → Email** — SMTP configuration and test email.

**Settings → Security** — active sessions (sign out individual or all other sessions), login history, recent activity.

## Roles

| Capability | Owner | Admin |
|---|:-:|:-:|
| Upload, download, preview, search, rename, move, delete files and folders | ✔ | ✔ |
| Own profile, password, sessions | ✔ | ✔ |
| Invite / edit / disable / delete administrators | ✔ | |
| Activity log (all users) | ✔ | |
| General, upload, Google Drive and SMTP settings | ✔ | |
| Sync with Drive | ✔ | |

There is always at least one active owner (the last owner cannot be disabled, demoted or deleted).

## Security parameters (in code)

| Setting | Value | File |
|---|---|---|
| Session idle timeout | 2 hours | `app/lib/Session.php` |
| Session absolute lifetime | 12 hours | `app/lib/Session.php` |
| Login lockout | 5 failures per account or 20 per IP in 15 min | `app/lib/RateLimiter.php` |
| Reset requests | 3 per email / 10 per IP per hour | `forgot-password.php` |
| Reset link lifetime | 30 minutes, single use | `forgot-password.php` |
| Invitation lifetime | 48 hours, single use | `admins.php` |
| Minimum password | 10 characters, letter + number | `app/lib/Auth.php` |
