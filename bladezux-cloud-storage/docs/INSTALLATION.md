# cPanel Deployment Guide

This guide installs Bladezux Cloud Storage at `https://yourdomain.com/storage/` **next to an existing website**.
Nothing outside the `storage/` folder (and one private folder outside `public_html`) is created or modified.

## 1. Requirements

| Item | Minimum | Notes |
|---|---|---|
| PHP | 8.2+ | cPanel → *Select PHP Version* / *MultiPHP Manager* |
| PHP extensions | `pdo_mysql`, `curl`, `openssl`, `mbstring`, `json`, `fileinfo`, `session` | Recommended: `intl`, `gd` |
| MySQL / MariaDB | MySQL 5.7+ / MariaDB 10.3+ | InnoDB, utf8mb4 |
| SSL certificate | Required for production | cPanel → *SSL/TLS Status* → AutoSSL |
| Outbound HTTPS | To `*.googleapis.com`, `accounts.google.com`, `oauth2.googleapis.com` | Allowed on virtually all shared hosts |
| A mailbox | e.g. `no-reply@yourdomain.com` | For password reset / invitation emails |

The installer shows a compatibility report (PHP version, extensions, `post_max_size`, `memory_limit`,
`max_execution_time`, HTTPS, folder permissions) before anything is written.

## 2. Package layout

```
bladezux-cloud-storage/
├── storage/            → upload to  public_html/storage/
├── private/            → only a template; the installer creates the real private folder
├── database/install.sql   (manual install / phpMyAdmin)
└── docs/
```

## 3. Upload the files

1. cPanel → **File Manager** → open `public_html`.
2. Create the folder `storage` (it must not exist yet — never overwrite an existing folder).
3. Upload `bladezux-cloud-storage-v1.0.0.zip`, extract it somewhere temporary, and move **the contents of the
   `storage/` folder** into `public_html/storage/`.
   The existing homepage, `.htaccess` and other site files in `public_html` are not touched.
4. Make sure hidden files were uploaded: `storage/.htaccess`, `storage/app/.htaccess`,
   `storage/uploads/.htaccess`, `storage/.user.ini` (File Manager → *Settings* → *Show Hidden Files*).

## 4. Create the database

cPanel → **MySQL® Databases**:

1. Create a database, e.g. `cpuser_bladezux`.
2. Create a user, e.g. `cpuser_bzx`, with a long random password.
3. *Add User To Database* → grant **ALL PRIVILEGES**.

## 5. Run the web installer

Open `https://yourdomain.com/storage/` — you are redirected to `/storage/install/`.

1. Review the compatibility report. Red items must be fixed (ask your host or use *Select PHP Version → Extensions*).
2. Fill in:
   - **Application URL**: `https://yourdomain.com/storage`
   - **Database** host (`localhost` on cPanel), name, user, password
   - **Private folder**: defaults to `/home/CPANELUSER/bladezux-private` — **outside `public_html`**.
     It receives `config.php` (database password + encryption key) and the log files.
   - **Owner account** name, email, password (independent of your cPanel login).
3. Click **Install**. The installer creates the tables, writes `config.php` (permissions `0640`), creates the owner
   account and locks itself.
4. **Delete the `public_html/storage/install/` folder.**

### Manual install (alternative)

1. Import `database/install.sql` with phpMyAdmin.
2. Copy `private/config.sample.php` to `/home/CPANELUSER/bladezux-private/config.php` and fill in every value
   (see [CONFIGURATION.md](CONFIGURATION.md)).
3. Open `https://yourdomain.com/storage/signup.php` and create the owner using the `setup_key` from `config.php`.
4. Delete `storage/install/`.

## 6. First sign-in

1. `https://yourdomain.com/storage/login.php` → sign in as the owner.
2. **Settings → Email**: configure SMTP and send a test email ([SMTP_SETUP.md](SMTP_SETUP.md)).
3. **Settings → Google Drive**: add OAuth credentials and connect ([GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)).
4. **Administrators**: invite your colleagues.
5. Work through the [post-install security checklist](SECURITY_CHECKLIST.md).

## 7. PHP limits

`storage/.user.ini` sets per-directory limits used by cPanel's PHP-FPM/MultiPHP:

```
post_max_size = 64M      ; relay-fallback chunk size ceiling
memory_limit = 256M
max_execution_time = 300
```

**Direct uploads do not depend on these values**: file data goes from the browser straight to Google Drive.
They only matter for the automatic relay fallback and for long downloads. If your host ignores `.user.ini`,
set the same values in cPanel → *MultiPHP INI Editor* for the domain.

## 8. Updating

1. Back up the database and the private folder.
2. Upload the new `storage/` files over the old ones (keep `storage/uploads/branding/`).
3. Do not re-run the installer; schema changes, if any, ship as separate migration SQL files.

## 9. Uninstalling

Delete `public_html/storage/`, the private folder, and the database. Files remain in the company Google Drive
inside the app folder; revoke the app at <https://myaccount.google.com/permissions> if desired.
