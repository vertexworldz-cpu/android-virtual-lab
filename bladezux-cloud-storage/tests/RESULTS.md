# Automated test results

Run on 2026-11-09 — PHP 8.3.6, MariaDB 10.11, Chromium (Playwright). Google replaced by the protocol mock in tests/mock-google/. Large-file run also passed with LARGE_MB=1024 (1 GB direct upload + download, SHA-256 verified).

```
✔ Fresh install redirects to the installer
✔ Installer wrote private config.php outside the web root
✔ Owner account created
✔ Installer locks itself after installation
✔ Public sign-up is closed once an owner exists
✔ Dashboard requires authentication
✔ Wrong password is rejected with a generic message
✔ Dashboard shows Drive onboarding when not connected
✔ Session cookie is HttpOnly, SameSite=Lax, scoped to /storage/
✔ API rejects mutations without a CSRF token (419)
✔ API rejects unauthenticated requests (401)
✔ Branded SMTP test email delivered
✔ SMTP password stored encrypted (or empty)
✔ Connected account email displayed
✔ Refresh token stored encrypted at rest
✔ Private app folder created in Google Drive
✔ OAuth callback with forged state shows a verification error
✔ Invitation email contains an activation link
✔ Invited admin is pending until activation
✔ Invite link opens the activation form
✔ Admin activated their account
✔ Admin role cannot open administrator management
✔ Invitation link cannot be reused
✔ Unknown email gets the same response (no account enumeration)
✔ Reset email delivered with a 30-minute link
✔ Only the SHA-256 hash of the reset token is stored
✔ Password reset completes and redirects to sign-in
✔ Existing admin session invalidated after password reset
✔ Reset link works only once
✔ Expired reset link (older than 30 min) is rejected
✔ Admin signs in with the new password
✔ Direct browser→Drive resumable upload used (64 MB in 0.9s, no PHP relay)
✔ Large file size verified and recorded in MySQL
✔ Large file bytes in Drive are identical to the original (SHA-256)
✔ File listing shows the 5 uploaded files
✔ Automatic chunk-relay fallback works when direct upload is blocked; bytes verified
✔ Upload survives transient 503 errors (retry + resume from Google offset)
✔ Upload paused part-way (Paused · 33%)
✔ Resumed upload completes with identical bytes
✔ Duplicate file name handled ("Keep both" → contract (1).pdf)
✔ PHP files (including double extensions like invoice.php.jpg) are rejected
✔ Private thumbnails proxied through the server
✔ Image preview renders (640×400 from Drive)
✔ PDF preview served inline with the correct type
✔ Audio/video streaming supports HTTP Range (206) for seeking
✔ Unsupported formats show file information with a download option
✔ Download streams the exact original bytes with the original file name
✔ Rename applied in MySQL and Google Drive
✔ Folder created (Drive + MySQL)
✔ Multi-select shows the selection toolbar
✔ Files moved between folders (Drive parents updated)
✔ Nested folders with breadcrumb navigation
✔ Search filters files across folders
✔ Type filter shows only PDFs
✔ Sort by size (largest first)
✔ List view renders
✔ Delete moves the file to Drive trash and removes it from the listing
✔ Folder delete removes nested folders and files
✔ Sync with Drive removes files deleted directly in Google Drive
✔ Dashboard totals come from the live database
✔ Dashboard charts render from real data
✔ Activity log records uploads
✔ Session management lists the current session
✔ Theme setting applies (dark/light)
✔ Upload quota exceeded is reported clearly
✔ Mobile dashboard has no horizontal overflow
✔ Mobile sidebar drawer opens
✔ Mobile file manager has no horizontal overflow
✔ Mobile settings has no horizontal overflow
✔ Tablet layout has no horizontal overflow
✔ Disconnected Drive shows a clear warning; uploads disabled
✔ Reconnect restores the connection (same app folder)
✔ Secure logout
✔ Session is invalid after logout
✔ No JavaScript errors in the browser console

ALL 75 CHECKS PASSED
```
