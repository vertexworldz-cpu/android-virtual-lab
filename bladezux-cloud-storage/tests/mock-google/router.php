<?php
/**
 * Mock Google OAuth 2.0 + Drive API v3 server — FOR AUTOMATED TESTS ONLY.
 *
 * Implements the subset of the real protocol the app uses, with the same semantics:
 *  - OAuth authorization-code flow with PKCE (S256), refresh tokens, revocation
 *  - files.create / get / list / update (rename, move, trash), about.get, alt=media with Range
 *  - Resumable uploads: session URI in Location, Content-Range chunks, 308 + Range,
 *    "bytes * /total" status queries, CORS bound to the Origin sent at session creation
 *    (Range is NOT exposed to the browser, like Google)
 *
 * Run: php -S 127.0.0.1:9100 tests/mock-google/router.php   (MOCK_STATE_DIR=/some/dir)
 * Test controls (files in MOCK_STATE_DIR): cors_disabled, fail_puts (count), quota_limit
 */
declare(strict_types=1);

$dir = getenv('MOCK_STATE_DIR') ?: sys_get_temp_dir() . '/bzx-mock';
@mkdir($dir . '/blobs', 0777, true);
@mkdir($dir . '/sessions', 0777, true);
$base = 'http://' . ($_SERVER['HTTP_HOST'] ?? '127.0.0.1:9100');

$lock = fopen($dir . '/lock', 'c');
flock($lock, LOCK_EX);
$state = is_file($dir . '/state.json') ? json_decode((string) file_get_contents($dir . '/state.json'), true) : null;
$state ??= ['codes' => [], 'tokens' => [], 'refresh' => [], 'files' => [], 'sessions' => [], 'seq' => 1];
$save = static function () use (&$state, $dir): void {
    file_put_contents($dir . '/state.json', json_encode($state));
};
$finish = static function () use ($save, $lock): void {
    $save();
    flock($lock, LOCK_UN);
};

function out(int $status, $body = null, array $headers = []): void
{
    http_response_code($status);
    foreach ($headers as $h) {
        header($h);
    }
    if (is_array($body)) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode($body);
    } elseif ($body !== null) {
        echo $body;
    }
}
function apiError(int $status, string $reason, string $message): array
{
    return ['error' => ['code' => $status, 'message' => $message, 'errors' => [['reason' => $reason, 'message' => $message]]]];
}

$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI']);
$path = $uri['path'];
parse_str($uri['query'] ?? '', $q);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$fields = static function (array $f, ?string $want) use ($base): array {
    $out = [
        'id' => $f['id'], 'name' => $f['name'], 'mimeType' => $f['mimeType'], 'parents' => $f['parents'],
        'trashed' => $f['trashed'], 'createdTime' => $f['createdTime'], 'modifiedTime' => $f['createdTime'],
    ];
    if ($f['mimeType'] !== 'application/vnd.google-apps.folder') {
        $out['size'] = (string) $f['size'];
        $out['md5Checksum'] = $f['md5'];
        $out['hasThumbnail'] = str_starts_with($f['mimeType'], 'image/');
        if ($out['hasThumbnail']) {
            $out['thumbnailLink'] = $base . '/thumb/' . $f['id'] . '=s220';
        }
    }
    return $out;
};
$authorized = static function () use (&$state): bool {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer (.+)$/', $h, $m)) {
        return false;
    }
    $t = $state['tokens'][$m[1]] ?? null;
    return $t !== null && $t > time();
};
$usage = static function () use (&$state): int {
    $sum = 5 * 1024 ** 3; // pretend 5 GB of other Gmail/Photos data
    foreach ($state['files'] as $f) {
        $sum += $f['trashed'] ? 0 : (int) ($f['size'] ?? 0);
    }
    return $sum;
};

// ------------------------------------------------------------------ OAuth
if ($path === '/o/oauth2/v2/auth') {
    $code = bin2hex(random_bytes(8));
    $state['codes'][$code] = ['challenge' => $q['code_challenge'] ?? '', 'redirect' => $q['redirect_uri'] ?? '', 'client' => $q['client_id'] ?? ''];
    $finish();
    header('Location: ' . $q['redirect_uri'] . '?' . http_build_query(['code' => $code, 'state' => $q['state'] ?? '', 'scope' => $q['scope'] ?? '']));
    http_response_code(302);
    exit;
}
if ($path === '/token' && $method === 'POST') {
    parse_str((string) file_get_contents('php://input'), $p);
    if (($p['client_secret'] ?? '') !== 'test-secret') {
        $finish();
        out(401, ['error' => 'invalid_client']);
        exit;
    }
    $access = 'ya29.' . bin2hex(random_bytes(12));
    if (($p['grant_type'] ?? '') === 'authorization_code') {
        $c = $state['codes'][$p['code'] ?? ''] ?? null;
        unset($state['codes'][$p['code'] ?? '']);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', (string) ($p['code_verifier'] ?? ''), true)), '+/', '-_'), '=');
        if (!$c || $c['redirect'] !== ($p['redirect_uri'] ?? '') || !hash_equals($c['challenge'], $challenge)) {
            $finish();
            out(400, ['error' => 'invalid_grant']);
            exit;
        }
        $refresh = '1//' . bin2hex(random_bytes(12));
        $state['refresh'][$refresh] = true;
        $state['tokens'][$access] = time() + 3600;
        $finish();
        out(200, ['access_token' => $access, 'refresh_token' => $refresh, 'expires_in' => 3599, 'token_type' => 'Bearer']);
        exit;
    }
    if (($p['grant_type'] ?? '') === 'refresh_token' && isset($state['refresh'][$p['refresh_token'] ?? ''])) {
        $state['tokens'][$access] = time() + 3600;
        $finish();
        out(200, ['access_token' => $access, 'expires_in' => 3599, 'token_type' => 'Bearer']);
        exit;
    }
    $finish();
    out(400, ['error' => 'invalid_grant']);
    exit;
}
if ($path === '/revoke') {
    parse_str((string) file_get_contents('php://input'), $p);
    unset($state['refresh'][$p['token'] ?? '']);
    $finish();
    out(200, []);
    exit;
}

// -------------------------------------------------------- resumable uploads
if ($path === '/upload/drive/v3/files') {
    $sid = $q['upload_id'] ?? null;
    if ($sid === null && $method === 'POST') {
        if (!$authorized()) {
            $finish();
            out(401, apiError(401, 'authError', 'Invalid Credentials'));
            exit;
        }
        $meta = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $size = (int) ($_SERVER['HTTP_X_UPLOAD_CONTENT_LENGTH'] ?? 0);
        $limit = is_file($dir . '/quota_limit') ? (int) file_get_contents($dir . '/quota_limit') : 15 * 1024 ** 3;
        if ($usage() + $size > $limit) {
            $finish();
            out(403, apiError(403, 'storageQuotaExceeded', 'The user\'s Drive storage quota has been exceeded.'));
            exit;
        }
        $sid = 'ABPtcP' . bin2hex(random_bytes(16));
        $state['sessions'][$sid] = ['meta' => $meta, 'size' => $size, 'received' => 0, 'origin' => $_SERVER['HTTP_ORIGIN'] ?? '', 'file' => null,
            'mime' => $_SERVER['HTTP_X_UPLOAD_CONTENT_TYPE'] ?? 'application/octet-stream'];
        touch($dir . '/sessions/' . $sid);
        $finish();
        out(200, '', ['Location: ' . $base . '/upload/drive/v3/files?uploadType=resumable&upload_id=' . $sid]);
        exit;
    }
    $s = $state['sessions'][$sid] ?? null;
    $cors = $s && $s['origin'] !== '' && $s['origin'] === $origin && !is_file($dir . '/cors_disabled');
    $corsHeaders = $cors ? ['Access-Control-Allow-Origin: ' . $origin, 'Vary: Origin'] : [];
    if ($method === 'OPTIONS') {
        $finish();
        out(200, '', $cors ? array_merge($corsHeaders, ['Access-Control-Allow-Methods: PUT, POST, DELETE', 'Access-Control-Allow-Headers: content-range, content-type', 'Access-Control-Max-Age: 3600']) : []);
        exit;
    }
    if (!$s) {
        $finish();
        out(404, apiError(404, 'notFound', 'Upload session not found'), $corsHeaders);
        exit;
    }
    if ($origin !== '' && !$cors) {
        // Browser request without matching CORS: the server still processes the body,
        // but the browser will refuse to expose the response (status 0 in XHR).
    }
    if ($method === 'DELETE') {
        unset($state['sessions'][$sid]);
        $finish();
        out(499, '', $corsHeaders);
        exit;
    }
    if ($method === 'PUT') {
        $range = $_SERVER['HTTP_CONTENT_RANGE'] ?? '';
        if ($s['file'] !== null) {
            $finish();
            out(200, $fields($state['files'][$s['file']], null), $corsHeaders);
            exit;
        }
        $failFile = $dir . '/fail_puts';
        if ($origin !== '' && is_file($failFile) && (int) file_get_contents($failFile) > 0 && !str_starts_with($range, 'bytes */')) {
            file_put_contents($failFile, (string) ((int) file_get_contents($failFile) - 1));
            $finish();
            out(503, apiError(503, 'backendError', 'Backend Error'), $corsHeaders);
            exit;
        }
        $data = (string) file_get_contents('php://input');
        if (preg_match('#^bytes (\d+)-(\d+)/(\d+|\*)$#', $range, $m)) {
            [$start, $end] = [(int) $m[1], (int) $m[2]];
            if ($start > $s['received'] || strlen($data) !== $end - $start + 1) {
                $finish();
                out(400, apiError(400, 'badContent', 'Invalid Content-Range'), $corsHeaders);
                exit;
            }
            $skip = $s['received'] - $start; // overlapping resend is tolerated
            $fh = fopen($dir . '/sessions/' . $sid, 'ab');
            fwrite($fh, substr($data, $skip));
            fclose($fh);
            $s['received'] = $end + 1;
        }
        if ($s['received'] >= $s['size'] && $s['size'] > 0) {
            $id = '1' . bin2hex(random_bytes(14));
            rename($dir . '/sessions/' . $sid, $dir . '/blobs/' . $id);
            $state['files'][$id] = [
                'id' => $id, 'name' => $s['meta']['name'] ?? 'Untitled', 'mimeType' => $s['meta']['mimeType'] ?? $s['mime'],
                'parents' => $s['meta']['parents'] ?? [], 'trashed' => false, 'size' => $s['size'],
                'md5' => md5_file($dir . '/blobs/' . $id), 'createdTime' => gmdate('Y-m-d\TH:i:s.000\Z'),
            ];
            $s['file'] = $id;
            $state['sessions'][$sid] = $s;
            $finish();
            out(200, $fields($state['files'][$id], null), $corsHeaders);
            exit;
        }
        $state['sessions'][$sid] = $s;
        $finish();
        out(308, '', array_merge($corsHeaders, $s['received'] > 0 ? ['Range: bytes=0-' . ($s['received'] - 1)] : []));
        exit;
    }
}

// --------------------------------------------------------------- thumbnails
if (preg_match('#^/thumb/([A-Za-z0-9]+)=s\d+$#', $path, $m)) {
    $f = $state['files'][$m[1]] ?? null;
    $finish();
    if (!$f) {
        out(404, 'not found');
        exit;
    }
    header('Content-Type: ' . $f['mimeType']);
    readfile($dir . '/blobs/' . $f['id']);
    exit;
}

// -------------------------------------------------------------- Drive REST
if (str_starts_with($path, '/drive/v3/')) {
    if (!$authorized()) {
        $finish();
        out(401, apiError(401, 'authError', 'Invalid Credentials'));
        exit;
    }
    if ($path === '/drive/v3/about') {
        $limit = is_file($dir . '/quota_limit') ? (int) file_get_contents($dir . '/quota_limit') : 15 * 1024 ** 3;
        $finish();
        out(200, ['user' => ['displayName' => 'Bladezux Company', 'emailAddress' => 'storage@bladezux.test'],
            'storageQuota' => ['limit' => (string) $limit, 'usage' => (string) $usage(), 'usageInDrive' => (string) $usage()]]);
        exit;
    }
    if ($path === '/drive/v3/files' && $method === 'POST') {
        $meta = json_decode((string) file_get_contents('php://input'), true) ?: [];
        $id = '1' . bin2hex(random_bytes(14));
        $state['files'][$id] = ['id' => $id, 'name' => $meta['name'] ?? 'Untitled', 'mimeType' => $meta['mimeType'] ?? 'application/octet-stream',
            'parents' => $meta['parents'] ?? ['root'], 'trashed' => false, 'size' => 0, 'md5' => null, 'createdTime' => gmdate('Y-m-d\TH:i:s.000\Z')];
        $finish();
        out(200, $fields($state['files'][$id], null));
        exit;
    }
    if ($path === '/drive/v3/files' && $method === 'GET') {
        preg_match("/'([^']+)' in parents/", $q['q'] ?? '', $m);
        $parent = $m[1] ?? null;
        $list = [];
        foreach ($state['files'] as $f) {
            if (!$f['trashed'] && in_array($parent, $f['parents'], true)) {
                $list[] = $fields($f, null);
            }
        }
        $finish();
        out(200, ['files' => $list]);
        exit;
    }
    if (preg_match('#^/drive/v3/files/([A-Za-z0-9]+)$#', $path, $m)) {
        $f = $state['files'][$m[1]] ?? null;
        if (!$f) {
            $finish();
            out(404, apiError(404, 'notFound', 'File not found: ' . $m[1]));
            exit;
        }
        if ($method === 'GET' && ($q['alt'] ?? '') === 'media') {
            $finish();
            $file = $dir . '/blobs/' . $f['id'];
            $size = filesize($file);
            $start = 0;
            $end = $size - 1;
            $status = 200;
            if (!empty($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $r)) {
                $start = $r[1] === '' ? $size - (int) $r[2] : (int) $r[1];
                $end = $r[1] !== '' && $r[2] !== '' ? min((int) $r[2], $size - 1) : $size - 1;
                if ($start >= $size) {
                    out(416, '');
                    exit;
                }
                $status = 206;
                header("Content-Range: bytes $start-$end/$size");
            }
            http_response_code($status);
            header('Content-Type: ' . $f['mimeType']);
            header('Content-Length: ' . ($end - $start + 1));
            $fh = fopen($file, 'rb');
            fseek($fh, $start);
            $left = $end - $start + 1;
            while ($left > 0 && !feof($fh)) {
                $buf = fread($fh, min(1 << 20, $left));
                $left -= strlen($buf);
                echo $buf;
            }
            exit;
        }
        if ($method === 'GET') {
            $finish();
            out(200, $fields($f, null));
            exit;
        }
        if ($method === 'PATCH') {
            $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
            if (isset($body['name'])) {
                $f['name'] = $body['name'];
            }
            if (!empty($body['trashed'])) {
                $f['trashed'] = true;
                // Trashing a folder trashes its descendants.
                $queue = [$f['id']];
                while ($queue) {
                    $p = array_shift($queue);
                    foreach ($state['files'] as $k => $c) {
                        if (in_array($p, $c['parents'], true) && !$c['trashed']) {
                            $state['files'][$k]['trashed'] = true;
                            $queue[] = $k;
                        }
                    }
                }
            }
            if (!empty($q['addParents'])) {
                $f['parents'] = array_values(array_diff($f['parents'], [$q['removeParents'] ?? '']));
                $f['parents'][] = $q['addParents'];
            }
            $state['files'][$f['id']] = array_merge($state['files'][$f['id']], ['name' => $f['name'], 'parents' => $f['parents'], 'trashed' => $f['trashed'] || $state['files'][$f['id']]['trashed']]);
            $finish();
            out(200, $fields($state['files'][$f['id']], null));
            exit;
        }
    }
}

$finish();
out(404, apiError(404, 'notFound', 'Unknown mock route ' . $method . ' ' . $path));
