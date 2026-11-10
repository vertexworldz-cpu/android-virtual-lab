<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

use Bladezux\{Auth, Database, View};

$user = Auth::requireOwner();
$filters = [
    'admin' => isset($_GET['admin']) && ctype_digit((string) $_GET['admin']) ? (int) $_GET['admin'] : 0,
    'type' => in_array($_GET['type'] ?? '', ['file', 'folder', 'auth', 'admin', 'drive', 'settings'], true) ? (string) $_GET['type'] : '',
    'q' => mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100),
];
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = 50;

$where = [];
$params = [];
if ($filters['admin']) {
    $where[] = 'l.admin_id = :a';
    $params['a'] = $filters['admin'];
}
if ($filters['type']) {
    $where[] = 'l.action LIKE :t';
    $params['t'] = $filters['type'] . '.%';
}
if ($filters['q'] !== '') {
    $where[] = 'l.description LIKE :q';
    $params['q'] = '%' . addcslashes($filters['q'], '%_\\') . '%';
}
$sqlWhere = $where ? ' WHERE ' . implode(' AND ', $where) : '';
$total = (int) Database::value('SELECT COUNT(*) FROM activity_logs l' . $sqlWhere, $params);
$pages = max(1, (int) ceil($total / $per));
$page = min($page, $pages);
$logs = Database::all('SELECT l.*, a.name AS admin_name FROM activity_logs l LEFT JOIN admins a ON a.id = l.admin_id'
    . $sqlWhere . ' ORDER BY l.id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $params);

View::render('activity', [
    'title' => 'Activity log',
    'active' => 'activity',
    'user' => $user,
    'logs' => $logs,
    'filters' => $filters,
    'page' => $page,
    'pages' => $pages,
    'total' => $total,
    'admins' => Database::all('SELECT id, name FROM admins ORDER BY name'),
]);
