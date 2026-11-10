<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

/** Public privacy policy (required by Google's OAuth consent screen "Branding" page). */

use Bladezux\{Settings, View};

$app = Settings::appName();
$host = parse_url(url('', true), PHP_URL_HOST) ?: 'this website';
ob_start();
?>
<div class="auth-head">
  <span class="eyebrow">Legal</span>
  <h1>Privacy Policy</h1>
  <p class="muted">Last updated <?= e(date('F j, Y', filemtime(__FILE__) ?: time())) ?></p>
</div>
<div class="policy">
  <p><?= e($app) ?> (“the application”), operated at <?= e($host) ?>, is a private file storage system for authorised company administrators only. It is not available to the public.</p>
  <h3>Information we process</h3>
  <ul>
    <li><strong>Administrator accounts:</strong> name, email address, a hashed password, sign-in times, IP addresses and browser type for security logs.</li>
    <li><strong>Files:</strong> files that administrators upload are stored in the company's own Google Drive account. The application stores only file metadata (name, size, type, folder, Google Drive file ID).</li>
  </ul>
  <h3>Google user data</h3>
  <p>The application uses Google OAuth to connect one company-owned Google Drive account. It requests the <code>drive.file</code> permission, which only allows access to files and folders that the application itself creates. The application uses this access solely to upload, list, preview, download, rename, move and delete the company's files on behalf of authorised administrators.</p>
  <p>Google user data is not sold, shared with third parties, used for advertising, or used to train AI models. OAuth tokens are stored encrypted on the company's server and are never sent to web browsers. The application's use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
  <h3>Data retention and deletion</h3>
  <p>Deleted files are moved to the Google Drive trash. The Google account owner can revoke the application's access at any time at <a href="https://myaccount.google.com/permissions" rel="noopener" target="_blank">myaccount.google.com/permissions</a>; the workspace owner can disconnect Google Drive and delete administrator accounts from within the application.</p>
  <h3>Security</h3>
  <p>Access requires an administrator account. Connections use HTTPS, passwords are hashed, and stored secrets are encrypted.</p>
  <h3>Contact</h3>
  <p>For questions about this policy, contact the website owner at <?= e($host) ?>.</p>
</div>
<p class="auth-foot"><a href="<?= e(url('login.php')) ?>">Back to sign in</a></p>
<?php
View::render('raw', ['title' => 'Privacy Policy', 'html' => (string) ob_get_clean()], 'auth-layout');
