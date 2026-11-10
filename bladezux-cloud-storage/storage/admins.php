<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Activity, Auth, Csrf, Database, Http, Mailer, Session, View};

$owner = Auth::requireOwner();
$errors = [];
$old = ['name' => '', 'email' => '', 'role' => 'admin', 'method' => 'invite'];

$activeOwners = static fn (): int => (int) Database::value("SELECT COUNT(*) FROM admins WHERE role = 'owner' AND status = 'active'");

if (Http::isPost()) {
    Csrf::check();
    $action = (string) ($_POST['action'] ?? '');
    $targetId = (int) ($_POST['id'] ?? 0);
    $target = $targetId ? Database::one('SELECT * FROM admins WHERE id = :id', ['id' => $targetId]) : null;

    switch ($action) {
        case 'create':
            $name = trim((string) ($_POST['name'] ?? ''));
            $email = strtolower(trim((string) ($_POST['email'] ?? '')));
            $role = ($_POST['role'] ?? '') === 'owner' ? 'owner' : 'admin';
            $method = ($_POST['method'] ?? '') === 'password' ? 'password' : 'invite';
            $password = (string) ($_POST['password'] ?? '');
            $old = compact('name', 'email', 'role', 'method');
            if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
                $errors[] = 'Enter the administrator\'s full name.';
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
                $errors[] = 'Enter a valid email address.';
            } elseif (Database::value('SELECT id FROM admins WHERE email = :e', ['e' => $email])) {
                $errors[] = 'An account with this email already exists.';
            }
            if ($method === 'password' && ($e = Auth::validatePassword($password, (string) ($_POST['password_confirm'] ?? ''), $email, $name))) {
                $errors[] = $e;
            }
            if ($errors) {
                break;
            }
            $id = Database::insert(
                'INSERT INTO admins (name, email, password_hash, role, status, created_by, password_changed_at) VALUES (:n, :e, :h, :r, :s, :c, :t)',
                ['n' => $name, 'e' => $email, 'h' => $method === 'password' ? Auth::hashPassword($password) : null, 'r' => $role,
                 's' => $method === 'password' ? 'active' : 'pending', 'c' => $owner['id'], 't' => $method === 'password' ? Database::now() : null]
            );
            $admin = ['id' => $id, 'name' => $name, 'email' => $email];
            if ($method === 'invite') {
                $token = Auth::createToken($id, 'invite', 48 * 3600);
                $link = url('signup.php?invite=' . urlencode($token), true);
                $mail = Mailer::invitation($admin, $owner['name'], $link);
                if ($mail['ok']) {
                    Session::flash('success', 'Invitation sent to ' . $email . '.');
                } else {
                    // Fall back to showing the link once so the owner can share it securely.
                    Session::set('invite_link', ['email' => $email, 'link' => $link]);
                    Session::flash('warning', 'Account created, but the invitation email could not be sent (' . $mail['error'] . '). Share the activation link below securely.');
                }
            } else {
                $mail = Mailer::accountCreated($admin, $owner['name']);
                Session::flash('success', 'Administrator account created for ' . $email . ($mail['ok'] ? ' and notified by email.' : '. (Email notification could not be sent.)'));
            }
            Activity::log('admin.created', 'Created ' . $role . ' account for ' . $email, 'admin', $id);
            Http::redirect('admins.php');

        case 'update':
            if (!$target) {
                break;
            }
            $name = trim((string) ($_POST['name'] ?? ''));
            $role = ($_POST['role'] ?? '') === 'owner' ? 'owner' : 'admin';
            if (mb_strlen($name) < 2 || mb_strlen($name) > 120) {
                $errors[] = 'Enter a valid name.';
                break;
            }
            if ((int) $target['id'] === (int) $owner['id'] && $role !== 'owner') {
                $errors[] = 'You cannot remove your own owner role.';
                break;
            }
            Database::run('UPDATE admins SET name = :n, role = :r WHERE id = :id', ['n' => $name, 'r' => $role, 'id' => $target['id']]);
            if ($role !== $target['role']) {
                Mailer::securityNotice($target, 'Your role was changed', 'Your role was changed from ' . $target['role'] . ' to ' . $role . ' by ' . $owner['name'] . '.');
            }
            Activity::log('admin.updated', 'Updated account ' . $target['email'] . ($role !== $target['role'] ? " (role: $role)" : ''), 'admin', $target['id']);
            Session::flash('success', 'Account updated.');
            Http::redirect('admins.php');

        case 'toggle':
            if (!$target) {
                break;
            }
            if ((int) $target['id'] === (int) $owner['id']) {
                $errors[] = 'You cannot disable your own account.';
                break;
            }
            if ($target['status'] === 'pending') {
                $errors[] = 'Pending invitations can be resent or deleted.';
                break;
            }
            $newStatus = $target['status'] === 'active' ? 'disabled' : 'active';
            if ($newStatus === 'disabled' && $target['role'] === 'owner' && $activeOwners() <= 1) {
                $errors[] = 'At least one active owner is required.';
                break;
            }
            Database::run('UPDATE admins SET status = :s WHERE id = :id', ['s' => $newStatus, 'id' => $target['id']]);
            if ($newStatus === 'disabled') {
                Auth::revokeAllSessions((int) $target['id']);
            }
            Mailer::securityNotice($target, 'Your account was ' . ($newStatus === 'active' ? 'enabled' : 'disabled'),
                'Your administrator account was ' . ($newStatus === 'active' ? 're-enabled' : 'disabled') . ' by ' . $owner['name'] . '.');
            Activity::log('admin.' . ($newStatus === 'active' ? 'enabled' : 'disabled'), ucfirst($newStatus === 'active' ? 'enabled' : 'disabled') . ' account ' . $target['email'], 'admin', $target['id']);
            Session::flash('success', 'Account ' . ($newStatus === 'active' ? 'enabled' : 'disabled') . '.');
            Http::redirect('admins.php');

        case 'resend':
            if (!$target || $target['status'] !== 'pending') {
                break;
            }
            $token = Auth::createToken((int) $target['id'], 'invite', 48 * 3600);
            $link = url('signup.php?invite=' . urlencode($token), true);
            $mail = Mailer::invitation($target, $owner['name'], $link);
            if (!$mail['ok']) {
                Session::set('invite_link', ['email' => $target['email'], 'link' => $link]);
                Session::flash('warning', 'The invitation email could not be sent (' . $mail['error'] . '). Share the activation link below securely.');
            } else {
                Session::flash('success', 'Invitation re-sent to ' . $target['email'] . '.');
            }
            Activity::log('admin.invite_resent', 'Re-sent invitation to ' . $target['email'], 'admin', $target['id']);
            Http::redirect('admins.php');

        case 'delete':
            if (!$target) {
                break;
            }
            if ((int) $target['id'] === (int) $owner['id']) {
                $errors[] = 'You cannot delete your own account.';
                break;
            }
            if ($target['role'] === 'owner' && $activeOwners() <= 1 && $target['status'] === 'active') {
                $errors[] = 'At least one active owner is required.';
                break;
            }
            if (trim((string) ($_POST['confirm_email'] ?? '')) !== $target['email']) {
                $errors[] = 'Type the account email to confirm deletion.';
                break;
            }
            Database::run('DELETE FROM admins WHERE id = :id', ['id' => $target['id']]);
            Activity::log('admin.deleted', 'Deleted account ' . $target['email'] . ' (files they uploaded are kept)', 'admin', $target['id']);
            Session::flash('success', 'Account deleted. Files uploaded by this administrator were kept.');
            Http::redirect('admins.php');
    }
    if (!$errors) {
        $errors[] = 'The account could not be found.';
    }
}

$admins = Database::all('SELECT a.*, c.name AS creator_name,
    (SELECT COUNT(*) FROM files f WHERE f.uploaded_by = a.id) AS file_count,
    (SELECT COUNT(*) FROM login_sessions s WHERE s.admin_id = a.id AND s.revoked_at IS NULL AND s.last_activity_at > :cut) AS session_count
    FROM admins a LEFT JOIN admins c ON c.id = a.created_by ORDER BY a.role = \'owner\' DESC, a.created_at ASC', ['cut' => Database::now(-\Bladezux\Session::ABSOLUTE_TIMEOUT)]);
$inviteLink = Session::get('invite_link');
Session::forget('invite_link');

View::render('admins', [
    'title' => 'Administrators',
    'active' => 'admins',
    'user' => $owner,
    'admins' => $admins,
    'errors' => $errors,
    'old' => $old,
    'inviteLink' => $inviteLink,
    'scripts' => ['settings.js'],
]);
