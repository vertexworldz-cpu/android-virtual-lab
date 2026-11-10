# Testing Checklist

## A. Automated end-to-end suite (already run during development)

`tests/e2e.js` drives a real Chromium browser through the complete workflow against the real PHP application and a
real MariaDB database. Google is replaced by `tests/mock-google/router.php`, which implements the OAuth 2.0 + Drive v3
protocol the app uses (PKCE, refresh tokens, resumable sessions with `Content-Range`, `308` + `Range`, status queries,
CORS bound to the session `Origin`, trash, parents, `alt=media` with `Range`). Email goes to `tests/smtp_sink.py`.

Last run: **75 / 75 checks passed** (see `tests/RESULTS.md`).

Run it yourself (Linux/macOS with PHP 8.2+, MariaDB/MySQL, Node 18+, Playwright):

```bash
export RUNTIME=/tmp/bzx-runtime            # scratch folder
tests/run-e2e.sh                           # starts mock Google, SMTP sink, PHP server; runs the suite
LARGE_MB=1024 tests/run-e2e.sh             # same with a 1 GB upload
```

What the suite covers:

| Area | Checks |
|---|---|
| Installer | redirect on fresh install, compatibility report, config written outside web root, owner created, installer locks itself |
| Auth | invite-only sign-up, auth required, generic login errors, cookie flags, CSRF (419), API 401 |
| Email | SMTP settings, branded test email, encrypted password |
| Google Drive | OAuth connect (PKCE + state), encrypted refresh token, private app folder, forged `state` rejected, disconnect, reconnect |
| Admins | invitation email, pending → active, admin cannot open owner pages, invite single use |
| Password reset | no enumeration, email link, only hash stored, reset works, old sessions revoked, link single use, expired link rejected, sign in with new password |
| Uploads | 64 MB (configurable) direct browser→Drive resumable upload with SHA-256 verification, multi-file queue, relay fallback when CORS is blocked, recovery from injected 503 errors, pause/resume, duplicate name dialog, PHP and double-extension blocking, quota exceeded |
| File manager | grid/list, thumbnails, image/PDF/audio previews, Range requests, unsupported-type info, download checksum, details, rename (DB + Drive), folders, nested folders + breadcrumb, multi-select, bulk move, search, type filter, sort, delete file (Drive trash), recursive folder delete |
| Sync / dashboard | Drive-side deletion picked up by sync, live dashboard totals and charts, notifications, activity log, sessions, theme |
| Responsive | no horizontal overflow on iPhone 13 and tablet; mobile drawer |

## B. Manual acceptance test on the real server (do this once after deployment)

Use a real Google account and real mailbox. Tick each item.

**Owner signup → login**
- [ ] Installer completes; `install/` deleted.
- [ ] Sign in as owner. Wrong password shows a generic error; 5 wrong attempts lock the account for 15 minutes.

**Email**
- [ ] Settings → Email → test email arrives (check spam folder).

**Create admin**
- [ ] Administrators → Add administrator (invitation) → email arrives → link opens *Activate your account*.
- [ ] Activate; the admin sees Dashboard/Files but not Administrators/Activity/Drive settings.

**Forgot password → email reset**
- [ ] Forgot password → email arrives within a minute → reset works → old sessions are signed out.
- [ ] Re-opening the same link shows *already used*; a link older than 30 minutes shows *expired*.

**Google Drive connect**
- [ ] Settings → Google Drive → credentials → Connect → Google consent → back to *Connected* with quota.
- [ ] In Google Drive, a private folder *Bladezux Cloud Storage* exists.

**Upload large file**
- [ ] Upload a ≥ 1 GB file. Progress, speed and time remaining update; the panel does **not** show "via server"
      (direct mode). Check in the browser dev-tools Network tab that chunks go to `www.googleapis.com`.
- [ ] Pause at ~30 %, resume — continues from the paused offset.
- [ ] Disable Wi-Fi for 30 seconds during an upload — it waits and resumes automatically when back online.
- [ ] Reload the page mid-upload, select the same file again in the same folder — it resumes (toast "Resuming…").
- [ ] Upload the same file name again → *File already exists* dialog (Keep both / Replace / Skip).
- [ ] Try uploading `test.php` → rejected.

**File listing → preview → download → rename → delete**
- [ ] File appears with correct size; it also appears in Google Drive inside the app folder.
- [ ] Preview an image, a PDF, an MP4 video (seek works) and an MP3.
- [ ] A `.docx` shows file information and a Download button.
- [ ] Download the large file; compare its checksum with the original (`certutil -hashfile file SHA256` /
      `shasum -a 256 file`).
- [ ] Rename the file — the new name appears in Google Drive.
- [ ] Create folder, nested folder, move files between them (also by drag-and-drop onto a folder or breadcrumb).
- [ ] Delete a file and a folder — they move to Google Drive's trash.
- [ ] Owner: Settings → Google Drive → *Sync with Drive* after renaming a file directly in Google Drive.

**Responsive**
- [ ] Phone: menu drawer, upload from the phone's file picker / camera roll, preview, download.
- [ ] Tablet and desktop layouts.

**Security spot checks** — see [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).
