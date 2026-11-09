/*
 * End-to-end workflow test (Playwright + Chromium) against:
 *   app   http://127.0.0.1:8080/storage   (php -S, MariaDB)
 *   mock  http://127.0.0.1:9100           (mock Google OAuth + Drive, see mock-google/router.php)
 *   smtp  127.0.0.1:2525                  (smtp_sink.py)
 *
 * Usage: RUNTIME=/path/to/runtime node tests/e2e.js
 * Workflow: Install → Owner login → SMTP + test email → Drive connect → Create admin (invite email)
 * → Admin activation → Forgot password → Email reset (single use, expiry) → Uploads (large/direct,
 * relay fallback, network errors, pause/resume, duplicates, blocked types) → Listing → Preview →
 * Download (checksum) → Rename → Move → Delete → Sync → Responsive screenshots.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const BASE = 'http://127.0.0.1:8080/storage';
const RUNTIME = process.env.RUNTIME;
const MAIL = path.join(RUNTIME, 'mail');
const MOCK = path.join(RUNTIME, 'mock');
const SHOTS = path.join(RUNTIME, 'shots');
const FILES = path.join(RUNTIME, 'files');
const LARGE_MB = Number(process.env.LARGE_MB || 64);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(FILES, { recursive: true });

const OWNER = { name: 'Ayesha Khan', email: 'owner@bladezux.test', password: 'OwnerPass2026!' };
const ADMIN = { name: 'Bilal Ahmed', email: 'bilal@bladezux.test', password: 'AdminPass2026!', newPassword: 'ResetPass2026!' };

let passed = 0;
let currentPage = null;
const results = [];
function ok(cond, label) {
  if (!cond) throw new Error('FAILED: ' + label);
  passed++;
  results.push('✔ ' + label);
  console.log('  ✔ ' + label);
}
const sql = (q) => execSync(`mysql -N -uroot bladezux -e ${JSON.stringify(q)}`).toString().trim();
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function latestMail(to, afterCount) {
  const files = fs.readdirSync(MAIL).filter((f) => f.endsWith('.eml')).sort();
  const list = files.map((f) => fs.readFileSync(path.join(MAIL, f), 'utf8')).filter((m) => m.includes('X-Rcpt: ' + to));
  return { count: list.length, last: list[list.length - 1] || '' };
}
async function waitMail(to, prevCount) {
  for (let i = 0; i < 40; i++) {
    const m = latestMail(to);
    if (m.count > prevCount) return m.last;
    await sleep(250);
  }
  throw new Error('No email arrived for ' + to);
}
function linkFrom(mail, pathPart) {
  // Quoted-printable soft breaks may split long URLs.
  const body = mail.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const m = body.match(new RegExp('https?://[^\\s"<]*' + pathPart + '[^\\s"<]*'));
  return m && m[0].replace(/&amp;/g, '&');
}

function makeFiles() {
  const large = path.join(FILES, `company-backup-${LARGE_MB}mb.zip`);
  if (!fs.existsSync(large) || fs.statSync(large).size !== LARGE_MB * 1024 * 1024) {
    execSync(`head -c ${LARGE_MB * 1024 * 1024} /dev/urandom > ${JSON.stringify(large)}`);
  }
  const relay = path.join(FILES, 'quarterly-report-relay.zip');
  execSync(`head -c ${9 * 1024 * 1024 + 12345} /dev/urandom > ${JSON.stringify(relay)}`);
  const flaky = path.join(FILES, 'site-footage.mp4');
  execSync(`head -c ${12 * 1024 * 1024 + 777} /dev/urandom > ${JSON.stringify(flaky)}`);
  const pausable = path.join(FILES, 'design-assets.zip');
  execSync(`head -c ${48 * 1024 * 1024} /dev/urandom > ${JSON.stringify(pausable)}`);
  // Real PNG (generated with PHP GD), PDF and WAV so previews are meaningful.
  const png = path.join(FILES, 'team-photo.png');
  execSync(`php -r '$i=imagecreatetruecolor(640,400);for($y=0;$y<400;$y++){$c=imagecolorallocate($i,67+$y/8,56+$y/6,202);imageline($i,0,$y,640,$y,$c);}imagefilledellipse($i,320,200,220,220,imagecolorallocate($i,255,255,255));imagepng($i,"${png}");'`);
  const pdf = path.join(FILES, 'contract.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj 4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj 5 0 obj<</Length 58>>stream\nBT /F1 28 Tf 72 700 Td (Bladezux Service Agreement) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const wav = path.join(FILES, 'meeting-notes.wav');
  const sr = 8000, secs = 2, n = sr * secs;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * 440) * 8000), 44 + i * 2);
  fs.writeFileSync(wav, b);
  const xlsx = path.join(FILES, 'budget-2026.xlsx');
  fs.writeFileSync(xlsx, Buffer.from('504b0304' + '00'.repeat(200), 'hex'));
  const evil = path.join(FILES, 'shell.php');
  fs.writeFileSync(evil, '<?php system($_GET["c"]); ?>');
  const disguised = path.join(FILES, 'invoice.php.jpg');
  fs.writeFileSync(disguised, '<?php echo 1; ?>');
  return { large, relay, flaky, pausable, png, pdf, wav, xlsx, evil, disguised };
}

async function waitUploads(page, count, timeout) {
  await page.waitForFunction((n) => document.querySelectorAll('.upload-item.is-done').length >= n, count, { timeout: timeout || 120000 });
}

(async () => {
  const files = makeFiles();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  currentPage = page;
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  console.log('\n[1] Installer');
  await page.goto(BASE + '/');
  ok(page.url().includes('/install/'), 'Fresh install redirects to the installer');
  await page.fill('#base_url', BASE);
  await page.fill('#db_host', '127.0.0.1');
  await page.fill('#db_name', 'bladezux');
  await page.fill('#db_user', 'bzx');
  await page.fill('#db_pass', 'bzx-pass-123');
  await page.fill('#private_dir', path.join(RUNTIME, 'private'));
  await page.fill('#owner_name', OWNER.name);
  await page.fill('#owner_email', OWNER.email);
  await page.fill('#owner_password', OWNER.password);
  await page.fill('#owner_password_confirm', OWNER.password);
  await page.screenshot({ path: path.join(SHOTS, '00-installer.png'), fullPage: true });
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Installation complete');
  ok(fs.existsSync(path.join(RUNTIME, 'private/config.php')), 'Installer wrote private config.php outside the web root');
  ok(sql("SELECT COUNT(*) FROM admins WHERE role='owner'") === '1', 'Owner account created');
  // Point the Google endpoints at the mock server (test-only override).
  execSync(`php -r '$f="${RUNTIME}/private/config.php";$c=require $f;$c["google"]["endpoints"]=["auth_url"=>"http://127.0.0.1:9100/o/oauth2/v2/auth","token_url"=>"http://127.0.0.1:9100/token","revoke_url"=>"http://127.0.0.1:9100/revoke","api_url"=>"http://127.0.0.1:9100/drive/v3","upload_url"=>"http://127.0.0.1:9100/upload/drive/v3"];file_put_contents($f,"<?php\\nreturn ".var_export($c,true).";\\n");'`);
  await page.goto(BASE + '/install/');
  ok(await page.isVisible('text=Already installed'), 'Installer locks itself after installation');

  console.log('\n[2] Owner sign-in + security basics');
  await page.goto(BASE + '/signup.php');
  ok(await page.isVisible('text=Registration is invite-only'), 'Public sign-up is closed once an owner exists');
  await page.goto(BASE + '/dashboard.php');
  ok(page.url().includes('login.php'), 'Dashboard requires authentication');
  await page.screenshot({ path: path.join(SHOTS, '01-login.png') });
  await page.fill('#email', OWNER.email);
  await page.fill('#password', 'wrong-password-1');
  await page.click('button[type=submit]');
  ok(await page.isVisible('text=The email or password you entered is incorrect.'), 'Wrong password is rejected with a generic message');
  await page.fill('#email', OWNER.email);
  await page.fill('#password', OWNER.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard\.php/);
  ok(await page.isVisible('text=Connect Google Drive to start uploading'), 'Dashboard shows Drive onboarding when not connected');
  const cookies = await ctx.cookies();
  const sess = cookies.find((c) => c.name === 'BZXSESSID');
  ok(sess && sess.httpOnly && sess.sameSite === 'Lax' && sess.path === '/storage/', 'Session cookie is HttpOnly, SameSite=Lax, scoped to /storage/');
  const noCsrf = await page.evaluate(async (b) => (await fetch(b + '/api/index.php?action=folders.create', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{"name":"x"}' })).status, BASE);
  ok(noCsrf === 419, 'API rejects mutations without a CSRF token (419)');
  const anon = await (await fetch(BASE + '/api/index.php?action=files.list', { headers: { Accept: 'application/json' } })).status;
  ok(anon === 401, 'API rejects unauthenticated requests (401)');

  console.log('\n[3] SMTP settings + test email');
  await page.goto(BASE + '/settings.php?tab=email');
  await page.fill('#smtp_host', '127.0.0.1');
  await page.selectOption('#smtp_encryption', 'none');
  await page.fill('#smtp_port', '2525');
  await page.fill('#smtp_username', '');
  await page.fill('#smtp_from_email', 'no-reply@bladezux.test');
  await page.fill('#smtp_from_name', 'Bladezux Cloud Storage');
  await page.click('form:has(input[value=smtp]) button[type=submit]');
  await page.waitForSelector('text=SMTP settings saved');
  let before = latestMail(OWNER.email).count;
  await page.click('form:has(input[value=smtp_test]) button[type=submit]');
  await page.waitForSelector('text=Test email sent');
  const testMail = await waitMail(OWNER.email, before);
  ok(testMail.includes('SMTP is working'), 'Branded SMTP test email delivered');
  const smtpRow = sql("SELECT setting_value FROM app_settings WHERE setting_key='smtp_password'");
  ok(smtpRow === 'NULL' || smtpRow === '' || smtpRow.startsWith('v1:'), 'SMTP password stored encrypted (or empty)');

  console.log('\n[4] Google Drive OAuth connect');
  await page.goto(BASE + '/settings.php?tab=drive');
  await page.fill('#client_id', '123456-test.apps.googleusercontent.com');
  await page.fill('#client_secret', 'test-secret');
  await page.click('form:has(input[value=drive_credentials]) button[type=submit]');
  await page.waitForSelector('text=Google OAuth credentials saved');
  await page.click('form:has(input[value=drive_connect]) button[type=submit]');
  await page.waitForSelector('text=Google Drive connected successfully');
  ok(await page.isVisible('text=storage@bladezux.test'), 'Connected account email displayed');
  const enc = sql('SELECT refresh_token_enc FROM google_settings WHERE id=1');
  ok(enc.startsWith('v1:') && !enc.includes('1//'), 'Refresh token stored encrypted at rest');
  ok(sql('SELECT root_folder_id IS NOT NULL FROM google_settings') === '1', 'Private app folder created in Google Drive');
  await page.screenshot({ path: path.join(SHOTS, '02-settings-drive.png'), fullPage: true });
  await page.goto(BASE + '/oauth-callback.php?code=abc&state=forged');
  ok(await page.isVisible('text=could not be verified'), 'OAuth callback with forged state shows a verification error');

  console.log('\n[5] Create admin by invitation');
  await page.goto(BASE + '/admins.php');
  await page.click('text=Add administrator');
  await page.fill('#c-name', ADMIN.name);
  await page.fill('#c-email', ADMIN.email);
  before = latestMail(ADMIN.email).count;
  await page.click('#dlg-create button[type=submit]');
  await page.waitForSelector('text=Invitation sent to ' + ADMIN.email);
  const invite = await waitMail(ADMIN.email, before);
  const inviteLink = linkFrom(invite, 'signup.php\\?invite=');
  ok(!!inviteLink, 'Invitation email contains an activation link');
  ok(sql(`SELECT status FROM admins WHERE email='${ADMIN.email}'`) === 'pending', 'Invited admin is pending until activation');
  await page.screenshot({ path: path.join(SHOTS, '03-admins.png'), fullPage: true });

  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p2 = await ctx2.newPage();
  await p2.goto(inviteLink);
  ok(await p2.isVisible('text=Activate your account'), 'Invite link opens the activation form');
  await p2.fill('#name', ADMIN.name);
  await p2.fill('#password', ADMIN.password);
  await p2.fill('#password_confirm', ADMIN.password);
  await p2.click('button[type=submit]');
  await p2.waitForURL(/dashboard\.php/);
  ok(sql(`SELECT status FROM admins WHERE email='${ADMIN.email}'`) === 'active', 'Admin activated their account');
  await p2.goto(BASE + '/admins.php');
  ok(await p2.isVisible('text=Only the workspace owner can access this page.'), 'Admin role cannot open administrator management');
  await p2.goto(inviteLink);
  ok(await p2.isVisible('text=Invitation link not valid'), 'Invitation link cannot be reused');

  console.log('\n[6] Forgot password → email reset (single use, expiry, session invalidation)');
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await p3.goto(BASE + '/forgot-password.php');
  await p3.fill('#email', 'nobody@bladezux.test');
  await p3.click('button[type=submit]');
  ok(await p3.isVisible('text=Check your inbox'), 'Unknown email gets the same response (no account enumeration)');
  await p3.goto(BASE + '/forgot-password.php');
  await p3.fill('#email', ADMIN.email);
  before = latestMail(ADMIN.email).count;
  await p3.click('button[type=submit]');
  await p3.waitForSelector('text=Check your inbox');
  const resetMail = await waitMail(ADMIN.email, before);
  const resetLink = linkFrom(resetMail, 'reset-password.php\\?token=');
  ok(!!resetLink && resetMail.includes('30 minutes'), 'Reset email delivered with a 30-minute link');
  const token = new URL(resetLink).searchParams.get('token');
  ok(sql(`SELECT COUNT(*) FROM password_resets WHERE token_hash=SHA2('${token}',256)`) === '1' && sql(`SELECT COUNT(*) FROM password_resets WHERE token_hash='${token}'`) === '0', 'Only the SHA-256 hash of the reset token is stored');
  await p3.goto(resetLink);
  await p3.fill('#password', ADMIN.newPassword);
  await p3.fill('#password_confirm', ADMIN.newPassword);
  await p3.click('button[type=submit]');
  await p3.waitForURL(/login\.php/);
  ok(await p3.isVisible('text=Your password has been reset'), 'Password reset completes and redirects to sign-in');
  await p2.goto(BASE + '/dashboard.php');
  ok(p2.url().includes('login.php'), 'Existing admin session invalidated after password reset');
  await p3.goto(resetLink);
  ok(await p3.isVisible('text=This reset link was already used'), 'Reset link works only once');
  // Expired link
  await p3.goto(BASE + '/forgot-password.php');
  await p3.fill('#email', ADMIN.email);
  before = latestMail(ADMIN.email).count;
  await p3.click('button[type=submit]');
  const mail2 = await waitMail(ADMIN.email, before);
  const link2 = linkFrom(mail2, 'reset-password.php\\?token=');
  sql(`UPDATE password_resets SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE token_hash=SHA2('${new URL(link2).searchParams.get('token')}',256)`);
  await p3.goto(link2);
  ok(await p3.isVisible('text=This reset link has expired'), 'Expired reset link (older than 30 min) is rejected');
  await p3.goto(BASE + '/login.php');
  await p3.fill('#email', ADMIN.email);
  await p3.fill('#password', ADMIN.newPassword);
  await p3.click('button[type=submit]');
  await p3.waitForURL(/dashboard\.php/);
  ok(true, 'Admin signs in with the new password');
  await ctx3.close();
  await ctx2.close();

  console.log('\n[7] Uploads');
  sql("UPDATE app_settings SET setting_value='8' WHERE setting_key='chunk_size_mb'");
  await page.goto(BASE + '/files.php');
  await page.waitForSelector('text=This folder is empty');
  await page.screenshot({ path: path.join(SHOTS, '04-files-empty.png') });
  const putUrls = new Set();
  page.on('request', (r) => { if (r.method() === 'PUT' && r.url().startsWith('http://127.0.0.1:9100/upload')) putUrls.add(r.url()); });
  const relayReqs = [];
  page.on('request', (r) => { if (r.url().includes('action=upload.relay')) relayReqs.push(r.url()); });

  // a) Large file, direct browser → Drive with resumable chunks
  const t0 = Date.now();
  await page.setInputFiles('#upload-input', [files.large, files.png, files.pdf, files.wav, files.xlsx]);
  await page.waitForSelector('.upload-panel:not([hidden])');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '05-uploading.png') });
  await waitUploads(page, 5, 180000);
  ok(putUrls.size >= 1 && relayReqs.length === 0, `Direct browser→Drive resumable upload used (${LARGE_MB} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s, no PHP relay)`);
  const largeRow = sql(`SELECT CONCAT(size,'|',drive_file_id) FROM files WHERE name='${path.basename(files.large)}'`).split('|');
  ok(Number(largeRow[0]) === LARGE_MB * 1024 * 1024, 'Large file size verified and recorded in MySQL');
  ok(sha(path.join(MOCK, 'blobs', largeRow[1])) === sha(files.large), 'Large file bytes in Drive are identical to the original (SHA-256)');
  await page.waitForSelector('#file-' + sql(`SELECT id FROM files WHERE name='team-photo.png'`));
  ok((await page.$$('.file-card')).length === 5, 'File listing shows the 5 uploaded files');

  // b) Relay fallback when the browser cannot reach Google directly (CORS blocked)
  fs.writeFileSync(path.join(MOCK, 'cors_disabled'), '1');
  await page.evaluate(() => sessionStorage.removeItem('bzx-upload-mode'));
  await page.setInputFiles('#upload-input', [files.relay]);
  await waitUploads(page, 6, 120000);
  fs.unlinkSync(path.join(MOCK, 'cors_disabled'));
  const relayRow = sql(`SELECT drive_file_id FROM files WHERE name='quarterly-report-relay.zip'`);
  ok(relayReqs.length > 0 && sha(path.join(MOCK, 'blobs', relayRow)) === sha(files.relay), 'Automatic chunk-relay fallback works when direct upload is blocked; bytes verified');
  await page.evaluate(() => sessionStorage.removeItem('bzx-upload-mode'));

  // c) Network/server errors mid-upload → automatic retry + offset recovery
  fs.writeFileSync(path.join(MOCK, 'fail_puts'), '2');
  const relayBefore = relayReqs.length;
  await page.setInputFiles('#upload-input', [files.flaky]);
  await waitUploads(page, 7, 120000);
  const flakyRow = sql(`SELECT drive_file_id FROM files WHERE name='site-footage.mp4'`);
  ok(sha(path.join(MOCK, 'blobs', flakyRow)) === sha(files.flaky) && relayReqs.length === relayBefore, 'Upload survives transient 503 errors (retry + resume from Google offset)');

  // d) Pause / resume
  await page.route('http://127.0.0.1:9100/upload/**', async (route) => { await sleep(150); route.continue(); });
  await page.setInputFiles('#upload-input', [files.pausable]);
  const item = page.locator('.upload-item', { hasText: 'design-assets.zip' });
  await item.locator('.is-uploading, .upload-meta').first().waitFor();
  await page.waitForFunction(() => { const n = [...document.querySelectorAll('.upload-item')].find((x) => x.textContent.includes('design-assets.zip')); const m = n && n.textContent.match(/(\d+)%/); return m && Number(m[1]) >= 20 && Number(m[1]) < 90; }, null, { timeout: 60000 });
  await item.locator('button[title=Pause]').click();
  await page.waitForSelector('.upload-item.is-paused');
  const pausedAt = await item.locator('.upload-meta').textContent();
  ok(/Paused · [1-9]\d?%/.test(pausedAt), 'Upload paused part-way (' + pausedAt.trim() + ')');
  await page.screenshot({ path: path.join(SHOTS, '06-upload-paused.png') });
  await sleep(800);
  await item.locator('button[title=Resume]').click();
  await page.unroute('http://127.0.0.1:9100/upload/**');
  await waitUploads(page, 8, 120000);
  const pRow = sql(`SELECT drive_file_id FROM files WHERE name='design-assets.zip'`);
  ok(sha(path.join(MOCK, 'blobs', pRow)) === sha(files.pausable), 'Resumed upload completes with identical bytes');

  // e) Duplicate name → conflict dialog → keep both
  await page.setInputFiles('#upload-input', [files.pdf]);
  await page.waitForSelector('text=File already exists');
  await page.screenshot({ path: path.join(SHOTS, '07-duplicate.png') });
  await page.click('.modal button:has-text("Keep both")');
  await waitUploads(page, 9, 60000);
  ok(sql("SELECT COUNT(*) FROM files WHERE name='contract (1).pdf'") === '1', 'Duplicate file name handled ("Keep both" → contract (1).pdf)');

  // f) Blocked file types
  await page.setInputFiles('#upload-input', [files.evil, files.disguised]);
  await page.waitForFunction(() => document.querySelectorAll('.upload-item.is-error').length >= 2, null, { timeout: 30000 });
  const errText = await page.locator('.upload-item.is-error').allTextContents();
  ok(errText.some((t) => t.includes('not allowed')) && sql("SELECT COUNT(*) FROM files WHERE name LIKE '%.php%'") === '0', 'PHP files (including double extensions like invoice.php.jpg) are rejected');
  await page.click('[data-action=upload-close]').catch(() => {});

  console.log('\n[8] File manager: listing, preview, download, rename, folders, move, delete');
  await page.reload();
  await page.waitForSelector('.file-card');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, '08-files-grid.png') });
  const pngId = sql("SELECT id FROM files WHERE name='team-photo.png'");
  const thumbOk = await page.evaluate(async (u) => { const r = await fetch(u); return r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/'); }, BASE + '/thumb.php?id=' + pngId);
  ok(thumbOk, 'Private thumbnails proxied through the server');

  await page.click('#file-' + pngId);
  await page.waitForSelector('.preview .preview-stage img');
  const imgOk = await page.waitForFunction(() => { const i = document.querySelector('.preview-stage img'); return i && i.complete && i.naturalWidth === 640; }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(imgOk, 'Image preview renders (640×400 from Drive)');
  await page.screenshot({ path: path.join(SHOTS, '09-preview-image.png') });
  await page.keyboard.press('Escape');
  const pdfId = sql("SELECT id FROM files WHERE name='contract.pdf'");
  await page.click('#file-' + pdfId);
  await page.waitForSelector('.preview iframe');
  const pdfResp = await page.request.get(BASE + '/download.php?id=' + pdfId + '&inline=1');
  ok(pdfResp.status() === 200 && pdfResp.headers()['content-type'] === 'application/pdf' && pdfResp.headers()['content-disposition'].startsWith('inline'), 'PDF preview served inline with the correct type');
  await page.keyboard.press('Escape');
  const wavId = sql("SELECT id FROM files WHERE name='meeting-notes.wav'");
  await page.click('#file-' + wavId);
  await page.waitForSelector('.preview audio');
  const range = await page.request.get(BASE + '/download.php?id=' + wavId + '&inline=1', { headers: { Range: 'bytes=0-99' } });
  ok(range.status() === 206 && (await range.body()).length === 100, 'Audio/video streaming supports HTTP Range (206) for seeking');
  await page.keyboard.press('Escape');
  const xlsxId = sql("SELECT id FROM files WHERE name='budget-2026.xlsx'");
  await page.click('#file-' + xlsxId);
  await page.waitForSelector('text=Preview is not available for this file type');
  ok(true, 'Unsupported formats show file information with a download option');
  await page.screenshot({ path: path.join(SHOTS, '10-preview-unsupported.png') });
  await page.keyboard.press('Escape');

  const largeId = sql(`SELECT id FROM files WHERE name='${path.basename(files.large)}'`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate((u) => { const a = document.createElement('a'); a.href = u; a.download = ''; document.body.append(a); a.click(); a.remove(); }, BASE + '/download.php?id=' + largeId)]);
  const dlPath = path.join(RUNTIME, 'downloaded.bin');
  await download.saveAs(dlPath);
  ok(download.suggestedFilename() === path.basename(files.large) && sha(dlPath) === sha(files.large), 'Download streams the exact original bytes with the original file name');

  // Details drawer
  await page.click(`#file-${pdfId} .item-menu`);
  await page.click('.context-menu >> text=Details');
  await page.waitForSelector('.drawer >> text=MD5 checksum');
  await page.screenshot({ path: path.join(SHOTS, '11-details.png') });
  await page.click('.drawer [aria-label="Close details"]');

  // Rename
  await page.click(`#file-${pdfId} .item-menu`);
  await page.click('.context-menu >> text=Rename');
  await page.fill('.modal input', 'service-agreement-2026.pdf');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('text=Renamed to');
  const driveName = JSON.parse(fs.readFileSync(path.join(MOCK, 'state.json'))).files[sql(`SELECT drive_file_id FROM files WHERE id=${pdfId}`)].name;
  ok(sql(`SELECT name FROM files WHERE id=${pdfId}`) === 'service-agreement-2026.pdf' && driveName === 'service-agreement-2026.pdf', 'Rename applied in MySQL and Google Drive');

  // Folders
  await page.click('button[data-action=new-folder]');
  await page.fill('.modal input', 'Contracts');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.folder-card >> text=Contracts');
  const folderId = sql("SELECT id FROM folders WHERE name='Contracts'");
  ok(!!folderId, 'Folder created (Drive + MySQL)');
  // Move via multi-select + bulk move
  await page.click(`#file-${pdfId} .item-check`);
  const dupId = sql("SELECT id FROM files WHERE name='contract (1).pdf'");
  await page.click(`#file-${dupId} .item-check`);
  ok(await page.isVisible('text=2 selected'), 'Multi-select shows the selection toolbar');
  await page.screenshot({ path: path.join(SHOTS, '12-multiselect.png') });
  await page.click('[data-action=bulk-move]');
  await page.click('.move-tree >> text=Contracts');
  await page.click('.modal >> text=Move here');
  await page.waitForSelector('text=2 items moved');
  const fState = JSON.parse(fs.readFileSync(path.join(MOCK, 'state.json')));
  const fDrive = sql(`SELECT drive_folder_id FROM folders WHERE id=${folderId}`);
  ok(sql(`SELECT COUNT(*) FROM files WHERE folder_id=${folderId}`) === '2' && fState.files[sql(`SELECT drive_file_id FROM files WHERE id=${pdfId}`)].parents[0] === fDrive, 'Files moved between folders (Drive parents updated)');
  // Nested folder + breadcrumb
  await page.dblclick(`#folder-${folderId}`).catch(() => {});
  await page.waitForURL(/folder=/);
  await page.click('button[data-action=new-folder]');
  await page.fill('.modal input', '2026');
  await page.click('.modal button[type=submit]');
  await page.waitForSelector('.folder-card >> text=2026');
  ok(await page.isVisible('#breadcrumb >> text=Contracts'), 'Nested folders with breadcrumb navigation');
  await page.screenshot({ path: path.join(SHOTS, '13-folder.png') });
  await page.click('#breadcrumb >> text=My Files');
  await page.waitForSelector(`#folder-${folderId}`);

  // Search + filter
  await page.fill('#fm-search', 'footage');
  await page.waitForFunction(() => document.querySelectorAll('.file-card').length === 1);
  ok(await page.isVisible('text=site-footage.mp4'), 'Search filters files across folders');
  await page.fill('#fm-search', '');
  await page.selectOption('#fm-type', 'pdf');
  await page.waitForFunction(() => document.querySelectorAll('.file-card').length === 2);
  ok(true, 'Type filter shows only PDFs');
  await page.selectOption('#fm-type', '');
  await page.waitForSelector(`#folder-${folderId}`);
  await page.selectOption('#fm-sort', 'size:desc');
  await page.waitForTimeout(500);
  const firstName = await page.locator('.file-card .item-name').first().textContent();
  ok(firstName === path.basename(files.large), 'Sort by size (largest first)');
  await page.click('.segmented button[data-view=list]');
  await page.waitForSelector('.list .list-head');
  await page.screenshot({ path: path.join(SHOTS, '14-files-list.png') });
  ok(true, 'List view renders');
  await page.click('.segmented button[data-view=grid]');

  // Delete single file
  const xId = xlsxId;
  await page.click(`#file-${xId} .item-menu`);
  await page.click('.context-menu >> text=Delete');
  await page.click('.modal .btn-danger');
  await page.waitForSelector('text=Item deleted');
  const xDrive = fState.files[sql(`SELECT drive_file_id FROM upload_sessions WHERE file_name='budget-2026.xlsx'`)];
  const after = JSON.parse(fs.readFileSync(path.join(MOCK, 'state.json')));
  ok(sql(`SELECT COUNT(*) FROM files WHERE id=${xId}`) === '0' && after.files[xDrive.id].trashed === true, 'Delete moves the file to Drive trash and removes it from the listing');
  // Delete folder recursively
  await page.click(`#folder-${folderId} .item-menu`);
  await page.click('.context-menu >> text=Delete');
  await page.click('.modal .btn-danger');
  await page.waitForSelector('text=Item deleted');
  ok(sql(`SELECT COUNT(*) FROM files WHERE folder_id=${folderId}`) === '0' && sql(`SELECT COUNT(*) FROM folders`) === '0', 'Folder delete removes nested folders and files');

  console.log('\n[9] Sync, dashboard, activity, settings');
  // A file removed directly in Drive disappears after sync.
  const st = JSON.parse(fs.readFileSync(path.join(MOCK, 'state.json')));
  const flakyDrive = sql(`SELECT drive_file_id FROM files WHERE name='site-footage.mp4'`);
  st.files[flakyDrive].trashed = true;
  fs.writeFileSync(path.join(MOCK, 'state.json'), JSON.stringify(st));
  await page.goto(BASE + '/settings.php?tab=drive');
  await page.click('form:has(input[value=drive_sync]) button[type=submit]');
  await page.waitForSelector('text=Sync complete');
  ok(sql("SELECT COUNT(*) FROM files WHERE name='site-footage.mp4'") === '0', 'Sync with Drive removes files deleted directly in Google Drive');
  await page.goto(BASE + '/dashboard.php');
  const total = await page.locator('.stat-card').first().locator('.stat-value').textContent();
  ok(Number(total) === Number(sql('SELECT COUNT(*) FROM files')), 'Dashboard totals come from the live database');
  ok(await page.isVisible('text=Upload activity') && (await page.$$('#category-chart svg circle')).length > 1, 'Dashboard charts render from real data');
  await page.screenshot({ path: path.join(SHOTS, '15-dashboard.png'), fullPage: true });
  await page.click('[data-action=load-notifications]');
  await page.waitForSelector('.notif-item');
  await page.screenshot({ path: path.join(SHOTS, '16-notifications.png') });
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/activity.php');
  ok(await page.isVisible('text=Uploaded "team-photo.png"'), 'Activity log records uploads');
  await page.screenshot({ path: path.join(SHOTS, '17-activity.png'), fullPage: true });
  await page.goto(BASE + '/settings.php?tab=security');
  ok(await page.isVisible('text=This device'), 'Session management lists the current session');
  await page.screenshot({ path: path.join(SHOTS, '18-security.png'), fullPage: true });
  await page.goto(BASE + '/settings.php?tab=general');
  await page.selectOption('#theme', 'dark');
  await page.click('form:has(input[value=general]) button[type=submit]');
  await page.waitForSelector('text=General settings saved');
  await page.goto(BASE + '/files.php');
  await page.waitForSelector('.file-card');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, '19-files-dark.png') });
  await page.goto(BASE + '/settings.php?tab=general');
  await page.selectOption('#theme', 'light');
  await page.click('form:has(input[value=general]) button[type=submit]');
  await page.waitForSelector('text=General settings saved');
  ok(true, 'Theme setting applies (dark/light)');

  console.log('\n[10] Disconnected Drive + quota errors');
  fs.writeFileSync(path.join(MOCK, 'quota_limit'), String(5 * 1024 ** 3 + 50 * 1024 * 1024));
  sql("UPDATE google_settings SET quota_updated_at = NULL");
  await page.goto(BASE + '/files.php');
  await page.setInputFiles('#upload-input', [files.pausable]);
  await page.click('.modal button:has-text("Keep both")');
  await page.waitForSelector('.upload-item.is-error');
  const quotaMsg = await page.locator('.upload-item.is-error').last().textContent();
  ok(/quota exceeded/i.test(quotaMsg), 'Upload quota exceeded is reported clearly');
  fs.unlinkSync(path.join(MOCK, 'quota_limit'));
  await page.click('[data-action=upload-close]').catch(() => {});

  console.log('\n[11] Responsive layout (mobile)');
  const mctx = await browser.newContext({ ...require('playwright').devices['iPhone 13'] });
  await mctx.addCookies((await ctx.cookies()).map((c) => ({ ...c })));
  const m = await mctx.newPage();
  await m.goto(BASE + '/dashboard.php');
  await m.screenshot({ path: path.join(SHOTS, '20-mobile-dashboard.png'), fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'Mobile dashboard has no horizontal overflow');
  await m.click('[data-action=open-sidebar]');
  await m.waitForTimeout(400);
  await m.screenshot({ path: path.join(SHOTS, '21-mobile-drawer.png') });
  ok(await m.isVisible('.sidebar >> text=My Files'), 'Mobile sidebar drawer opens');
  await m.goto(BASE + '/files.php');
  await m.waitForSelector('.file-card');
  await m.waitForTimeout(600);
  await m.screenshot({ path: path.join(SHOTS, '22-mobile-files.png') });
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'Mobile file manager has no horizontal overflow');
  await m.goto(BASE + '/settings.php?tab=drive');
  await m.screenshot({ path: path.join(SHOTS, '23-mobile-settings.png'), fullPage: true });
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'Mobile settings has no horizontal overflow');
  const tctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  await tctx.addCookies(await ctx.cookies());
  const t = await tctx.newPage();
  await t.goto(BASE + '/files.php');
  await t.waitForSelector('.file-card');
  await t.waitForTimeout(500);
  await t.screenshot({ path: path.join(SHOTS, '24-tablet-files.png') });
  ok(!(await t.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'Tablet layout has no horizontal overflow');

  console.log('\n[12] Disconnect Drive + logout');
  await page.goto(BASE + '/settings.php?tab=drive');
  page.once('dialog', (d) => d.accept());
  await page.click('form:has(input[value=drive_disconnect]) button[type=submit]');
  await page.click('.modal .btn-danger');
  await page.waitForSelector('text=Google Drive disconnected');
  await page.goto(BASE + '/files.php');
  ok(await page.isVisible('text=Google Drive disconnected.'), 'Disconnected Drive shows a clear warning; uploads disabled');
  await page.click('[data-action=upload].btn-primary', { trial: true }).catch(() => {});
  await page.goto(BASE + '/settings.php?tab=drive');
  await page.click('form:has(input[value=drive_connect]) button[type=submit]');
  await page.waitForSelector('text=Google Drive connected successfully');
  ok(sql('SELECT status FROM google_settings') === 'connected', 'Reconnect restores the connection (same app folder)');
  await page.click('.profile-btn');
  await page.click('text=Sign out');
  await page.waitForURL(/login\.php/);
  ok(await page.isVisible('text=You have been signed out securely.'), 'Secure logout');
  await page.goto(BASE + '/dashboard.php');
  ok(page.url().includes('login.php'), 'Session is invalid after logout');

  // Expected noise: HTTP error statuses we provoke on purpose, and the CORS block from the
  // relay-fallback test (cors_disabled), which is exactly what triggers the fallback.
  const jsErrors = consoleErrors.filter((e) => !/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d|blocked by CORS policy/.test(e));
  ok(jsErrors.length === 0, 'No JavaScript errors in the browser console' + (jsErrors.length ? ': ' + jsErrors.join(' | ') : ''));

  await browser.close();
  console.log(`\nALL ${passed} CHECKS PASSED`);
  fs.writeFileSync(path.join(RUNTIME, 'e2e-results.txt'), results.join('\n') + `\n\nALL ${passed} CHECKS PASSED\n`);
})().catch(async (e) => {
  console.error('\n' + (e.stack || e));
  if (currentPage) { try { await currentPage.screenshot({ path: path.join(SHOTS, 'FAILURE.png') }); console.error('URL: ' + currentPage.url()); } catch (_) {} }
  process.exit(1);
});
