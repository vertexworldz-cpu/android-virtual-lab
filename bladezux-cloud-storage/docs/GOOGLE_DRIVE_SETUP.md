# Google Drive API & OAuth 2.0 Setup

Bladezux stores every file in **one company Google Drive account** using the official Drive API v3 and
OAuth 2.0 (authorization-code flow with PKCE, offline access). Tokens never reach the browser.

## 1. Create a Google Cloud project

1. Sign in to <https://console.cloud.google.com/> **with the company Google account that will own the files**
   (or an admin of your Workspace organisation).
2. Project selector → **New project** → name it `Bladezux Cloud Storage` → Create.

## 2. Enable the Google Drive API

**APIs & Services → Library** → search *Google Drive API* → **Enable**.

## 3. Configure the OAuth consent screen

**APIs & Services → OAuth consent screen** (on newer consoles: *Google Auth Platform → Branding / Audience*):

| Field | Value |
|---|---|
| User type | **Internal** if you use Google Workspace (no verification needed). Otherwise **External**. |
| App name | Bladezux Cloud Storage |
| Support email / developer contact | your admin address |
| Authorized domain | `yourdomain.com` |
| Scopes | `.../auth/drive.file` (recommended) — or `.../auth/drive` (see below) |

For an **External** app, add the company Google account under **Test users**, or click **Publish app**.
Note: refresh tokens of External apps left in *Testing* status **expire after 7 days** — publish the app (or use
an Internal app) for production. `drive.file` is a non-sensitive scope, so publishing does not require Google's
security review.

## 4. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**

| Field | Value |
|---|---|
| Application type | **Web application** |
| Name | Bladezux Cloud Storage |
| Authorized JavaScript origins | `https://yourdomain.com` |
| Authorized redirect URIs | `https://yourdomain.com/storage/oauth-callback.php` |

The exact redirect URI is shown (with a copy button) in **Settings → Google Drive** inside the app.
Copy the **Client ID** and **Client secret**.

## 5. Connect inside Bladezux

1. Sign in as the **owner** → **Settings → Google Drive**.
2. Paste the Client ID and Client secret → **Save credentials** (the secret is stored AES-256-GCM encrypted).
3. Click **Connect Google Drive** → choose the company account → **Allow**.
4. You return to Settings showing *Connected*, the account email and the storage quota.
   A private folder named after the application (default *Bladezux Cloud Storage*) is created in that Drive.
   All uploads go into that folder; sub-folders mirror the folders you create in the app.

## Access scope: `drive.file` vs `drive`

| | `drive.file` (default, recommended) | `drive` (full) |
|---|---|---|
| What the app can see | Only files/folders it created | Everything in the Drive |
| Google verification | Not required | Restricted scope — verification required for External apps |
| "Sync with Drive" | Picks up renames/deletions of app files made in Drive | Also imports files added to the app folder directly in Drive |

Change the scope in Settings and reconnect.

## How uploads reach Google Drive

1. The browser asks PHP to start an upload (`upload.init`). PHP validates the name, size, type and quota,
   then creates a **resumable upload session** with the Drive API, sending `Origin: https://yourdomain.com`.
2. PHP returns only the **session URI** (a single-file, time-limited upload capability). The OAuth access token,
   refresh token and client secret never leave the server.
3. The browser uploads the file in chunks (default 16 MB, multiple of 256 KiB) with `PUT` + `Content-Range`
   directly to the session URI. Google answers `308` until the last chunk.
4. After the last chunk PHP re-reads the file metadata from Drive (size and parent folder must match) and only
   then records it in MySQL.
5. On any error the browser asks PHP for the authoritative offset (`PUT bytes */total` against the session) and
   resumes from there — after network drops, pauses or page reloads (re-select the same file; the unfinished
   session is found by a fingerprint of name, size, last-modified date and folder).

**Fallback**: if the browser cannot reach the session URI directly (corporate proxy, browser extension, or Google
not returning CORS headers), the uploader switches automatically to *relay mode*: each chunk is posted to PHP and
forwarded to the same Drive session. Chunks are never stored on disk; chunk size is capped by `post_max_size`.
The upload panel shows "via server" when this happens.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must match exactly, including `https` and `/storage/oauth-callback.php`. |
| "did not return a refresh token" | Remove the app at <https://myaccount.google.com/permissions> and connect again (the app always requests `prompt=consent`). |
| Status "Reconnect required" after ~7 days | External app still in *Testing* → publish it, then reconnect. |
| `invalid_client` | Wrong client secret, or the OAuth client was deleted. Re-enter credentials. |
| "Upload quota exceeded" | The Drive account is full. Free space or upgrade storage. |
| Uploads show "via server" | Direct upload blocked by the network; uploads still work, but use hosting bandwidth. |
| Rate limiting messages | Drive API quota (requests per minute). The app retries with back-off automatically. |

## Google limits that apply

- Max file size: **5 TB** per file.
- Upload volume: about **750 GB per user per day** (Google Drive policy).
- Resumable session URIs expire after about **one week**.
- Drive API request quotas per project/user (see Google Cloud → APIs → Drive API → Quotas).
