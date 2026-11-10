<?php
declare(strict_types=1);

namespace Bladezux;

/**
 * Google Drive API v3 + OAuth 2.0 client (REST over cURL, no SDK required).
 *
 * Tokens and the client secret are stored AES-256-GCM encrypted and are never
 * sent to the browser. The browser only ever receives a single-file resumable
 * upload session URI, created by this class for an authenticated admin.
 */
final class GoogleDrive
{
    public const FOLDER_MIME = 'application/vnd.google-apps.folder';
    public const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
    public const SCOPE_FULL = 'https://www.googleapis.com/auth/drive';
    public const FILE_FIELDS = 'id,name,mimeType,size,md5Checksum,hasThumbnail,thumbnailLink,createdTime,modifiedTime,parents,trashed';

    private const DEFAULT_ENDPOINTS = [
        'auth_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
        'token_url' => 'https://oauth2.googleapis.com/token',
        'revoke_url' => 'https://oauth2.googleapis.com/revoke',
        'api_url' => 'https://www.googleapis.com/drive/v3',
        'upload_url' => 'https://www.googleapis.com/upload/drive/v3',
    ];

    private static ?array $settings = null;

    public static function endpoint(string $name): string
    {
        $override = App::config('google.endpoints.' . $name);
        return is_string($override) && $override !== '' ? rtrim($override, '/') : self::DEFAULT_ENDPOINTS[$name];
    }

    public static function settings(bool $fresh = false): array
    {
        if (self::$settings === null || $fresh) {
            self::$settings = Database::one('SELECT * FROM google_settings WHERE id = 1') ?? ['id' => 1, 'status' => 'not_configured'];
        }
        return self::$settings;
    }

    private static function update(array $fields): void
    {
        $sets = [];
        foreach (array_keys($fields) as $key) {
            $sets[] = "`$key` = :$key";
        }
        Database::run('UPDATE google_settings SET ' . implode(', ', $sets) . ' WHERE id = 1', $fields);
        self::$settings = null;
    }

    public static function redirectUri(): string
    {
        return App::baseUrl() . '/oauth-callback.php';
    }

    public static function hasCredentials(): bool
    {
        $s = self::settings();
        return !empty($s['client_id']) && !empty($s['client_secret_enc']);
    }

    public static function isConnected(): bool
    {
        $s = self::settings();
        return $s['status'] === 'connected' && !empty($s['refresh_token_enc']) && !empty($s['root_folder_id']);
    }

    public static function saveCredentials(string $clientId, ?string $clientSecret, string $scope): void
    {
        $fields = ['client_id' => $clientId, 'scope' => $scope];
        if ($clientSecret !== null && $clientSecret !== '') {
            $fields['client_secret_enc'] = Crypto::encrypt($clientSecret);
        }
        $s = self::settings();
        if ($s['status'] === 'not_configured') {
            $fields['status'] = 'disconnected';
        }
        self::update($fields);
    }

    // ------------------------------------------------------------------ OAuth

    public static function authorizationUrl(): string
    {
        if (!self::hasCredentials()) {
            throw new DriveException('Enter your Google OAuth client ID and secret first.', 400, 'not_configured');
        }
        $state = bin2hex(random_bytes(24));
        $verifier = Crypto::token(48);
        $_SESSION['oauth'] = ['state' => $state, 'verifier' => $verifier, 'expires' => time() + 600, 'admin' => Auth::id()];
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        $s = self::settings();
        return self::endpoint('auth_url') . '?' . http_build_query([
            'client_id' => $s['client_id'],
            'redirect_uri' => self::redirectUri(),
            'response_type' => 'code',
            'scope' => $s['scope'] ?: self::SCOPE_FILE,
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
            'code_challenge' => $challenge,
            'code_challenge_method' => 'S256',
        ]);
    }

    public static function handleCallback(string $code, string $state): void
    {
        $pending = $_SESSION['oauth'] ?? null;
        unset($_SESSION['oauth']);
        if (!is_array($pending) || !hash_equals((string) $pending['state'], $state) || $pending['expires'] < time()
            || (int) $pending['admin'] !== (int) Auth::id()) {
            throw new DriveException('The authorization request could not be verified (invalid or expired state). Please try connecting again.', 400, 'invalid_state');
        }
        $s = self::settings(true);
        $response = self::tokenRequest([
            'code' => $code,
            'client_id' => $s['client_id'],
            'client_secret' => Crypto::decrypt($s['client_secret_enc']),
            'redirect_uri' => self::redirectUri(),
            'grant_type' => 'authorization_code',
            'code_verifier' => $pending['verifier'],
        ]);
        if (empty($response['refresh_token'])) {
            throw new DriveException('Google did not return a refresh token. Remove the app from your Google account permissions and connect again.', 400, 'no_refresh_token');
        }
        self::update([
            'access_token_enc' => Crypto::encrypt($response['access_token']),
            'refresh_token_enc' => Crypto::encrypt($response['refresh_token']),
            'token_expires_at' => Database::now((int) ($response['expires_in'] ?? 3600) - 60),
            'status' => 'connected',
            'last_error' => null,
            'connected_by' => Auth::id(),
            'connected_at' => Database::now(),
        ]);
        self::refreshAbout();
        self::ensureRootFolder();
    }

    private static function tokenRequest(array $params): array
    {
        [$status, , $body] = self::curl('POST', self::endpoint('token_url'), [
            'Content-Type: application/x-www-form-urlencoded',
        ], http_build_query($params));
        $data = json_decode($body, true);
        if ($status !== 200 || !is_array($data) || empty($data['access_token'])) {
            $error = is_array($data) ? (string) ($data['error'] ?? 'unknown') : 'unknown';
            Logger::warning("OAuth token request failed: HTTP $status error=$error");
            if ($error === 'invalid_grant') {
                throw new DriveException('Google Drive authorization has expired or was revoked. Please reconnect Google Drive.', 401, 'invalid_grant');
            }
            if ($error === 'invalid_client') {
                throw new DriveException('Google rejected the OAuth client ID or secret. Check the credentials in Settings → Google Drive.', 400, 'invalid_client');
            }
            throw new DriveException('Google OAuth authorization failed. Please try again.', 502, 'oauth_failed');
        }
        return $data;
    }

    public static function accessToken(bool $forceRefresh = false): string
    {
        $s = self::settings();
        if (empty($s['refresh_token_enc'])) {
            throw new DriveException('Google Drive is not connected. The owner must connect it in Settings → Google Drive.', 503, 'disconnected');
        }
        $expires = $s['token_expires_at'] ? strtotime($s['token_expires_at'] . ' UTC') : 0;
        $token = Crypto::decrypt($s['access_token_enc']);
        if (!$forceRefresh && $token && $expires > time() + 30) {
            return $token;
        }
        try {
            $data = self::tokenRequest([
                'client_id' => $s['client_id'],
                'client_secret' => Crypto::decrypt($s['client_secret_enc']),
                'refresh_token' => Crypto::decrypt($s['refresh_token_enc']),
                'grant_type' => 'refresh_token',
            ]);
        } catch (DriveException $e) {
            if ($e->reason === 'invalid_grant' || $e->reason === 'invalid_client') {
                self::update(['status' => 'error', 'last_error' => $e->getMessage()]);
            }
            throw $e;
        }
        $fields = [
            'access_token_enc' => Crypto::encrypt($data['access_token']),
            'token_expires_at' => Database::now((int) ($data['expires_in'] ?? 3600) - 60),
        ];
        if (!empty($data['refresh_token'])) {
            $fields['refresh_token_enc'] = Crypto::encrypt($data['refresh_token']);
        }
        if ($s['status'] === 'error') {
            $fields['status'] = 'connected';
            $fields['last_error'] = null;
        }
        self::update($fields);
        return $data['access_token'];
    }

    public static function disconnect(): void
    {
        $s = self::settings(true);
        $token = Crypto::decrypt($s['refresh_token_enc'] ?? null);
        if ($token) {
            try {
                self::curl('POST', self::endpoint('revoke_url'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query(['token' => $token]));
            } catch (\Throwable $e) {
                Logger::warning('Token revoke failed: ' . $e->getMessage());
            }
        }
        self::update([
            'access_token_enc' => null,
            'refresh_token_enc' => null,
            'token_expires_at' => null,
            'status' => 'disconnected',
            'last_error' => null,
        ]);
    }

    // ------------------------------------------------------------------ HTTP

    /**
     * Raw cURL request. Returns [status, headers(lowercase keys), body].
     * @param callable|null $writer optional streaming body writer
     */
    public static function curl(string $method, string $url, array $headers = [], ?string $body = null, ?callable $writer = null, ?callable $headerSink = null, int $timeout = 120): array
    {
        $ch = curl_init($url);
        $responseHeaders = [];
        $chunks = '';
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => $writer === null,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders, $headerSink): int {
                $len = strlen($line);
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) {
                    $responseHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                } elseif (str_starts_with($line, 'HTTP/')) {
                    $responseHeaders = [];
                }
                if ($headerSink !== null && trim($line) === '') {
                    $headerSink((int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE), $responseHeaders);
                }
                return $len;
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        } elseif (in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, '');
        }
        if ($writer !== null) {
            curl_setopt($ch, CURLOPT_WRITEFUNCTION, static function ($ch, string $data) use ($writer): int {
                return $writer($data) === false ? 0 : strlen($data);
            });
        }
        $result = curl_exec($ch);
        $errno = curl_errno($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($errno !== 0 && !($writer !== null && $errno === CURLE_WRITE_ERROR)) {
            Logger::warning("cURL $method " . preg_replace('/\?.*/', '', $url) . " failed: [$errno] $error");
            throw new DriveException('Could not reach Google Drive. Please check the server\'s internet connection and try again.', 504, 'network');
        }
        return [$status, $responseHeaders, is_string($result) ? $result : $chunks];
    }

    /**
     * Authorised Drive API request with token refresh and retry on 429/5xx.
     * @return array{0:int,1:array,2:mixed}
     */
    public static function api(string $method, string $path, array $query = [], ?array $json = null, string $base = 'api_url', array $extraHeaders = []): array
    {
        $url = self::endpoint($base) . $path . ($query ? '?' . http_build_query($query) : '');
        $attempt = 0;
        $refreshed = false;
        while (true) {
            $attempt++;
            $headers = array_merge(['Authorization: Bearer ' . self::accessToken(), 'Accept: application/json'], $extraHeaders);
            $body = null;
            if ($json !== null) {
                $headers[] = 'Content-Type: application/json; charset=UTF-8';
                $body = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            }
            [$status, $headersOut, $raw] = self::curl($method, $url, $headers, $body);
            $data = json_decode($raw, true);

            if ($status === 401 && !$refreshed) {
                $refreshed = true;
                self::accessToken(true);
                continue;
            }
            $reason = is_array($data) ? (string) ($data['error']['errors'][0]['reason'] ?? $data['error']['status'] ?? '') : '';
            $retryable = $status === 429 || $status >= 500 || in_array($reason, ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'], true);
            if ($retryable && $attempt < 4) {
                usleep((int) ((2 ** $attempt) * 250000 + random_int(0, 250000)));
                continue;
            }
            if ($status >= 400) {
                throw self::errorFor($status, $reason, is_array($data) ? (string) ($data['error']['message'] ?? '') : '');
            }
            return [$status, $headersOut, $data ?? $raw];
        }
    }

    public static function errorFor(int $status, string $reason, string $message = ''): DriveException
    {
        Logger::warning("Drive API error HTTP $status reason=$reason message=" . mb_substr($message, 0, 200));
        return match (true) {
            in_array($reason, ['storageQuotaExceeded', 'quotaExceeded'], true)
                => new DriveException('Upload quota exceeded: the Google Drive account does not have enough free storage.', 507, 'quota_exceeded'),
            $status === 401 => new DriveException('Google Drive authorization failed. Please reconnect Google Drive in Settings.', 401, 'unauthorized'),
            $status === 404 => new DriveException('The item no longer exists in Google Drive. Run "Sync with Drive" to refresh the listing.', 404, 'not_found'),
            $status === 403 && in_array($reason, ['insufficientPermissions', 'appNotAuthorizedToFile', 'insufficientFilePermissions'], true)
                => new DriveException('The application does not have permission to access this Google Drive item.', 403, 'forbidden'),
            $status === 429 || $status === 403 => new DriveException('Google Drive is rate-limiting requests. Please wait a moment and try again.', 429, 'rate_limited'),
            $status === 400 => new DriveException('Google Drive rejected the request.', 400, 'bad_request'),
            default => new DriveException('Google Drive is temporarily unavailable. Please try again shortly.', 502, 'drive_error'),
        };
    }

    // ------------------------------------------------------------- Drive ops

    public static function refreshAbout(): array
    {
        [, , $data] = self::api('GET', '/about', ['fields' => 'user(displayName,emailAddress),storageQuota(limit,usage,usageInDrive)']);
        $quota = $data['storageQuota'] ?? [];
        self::update([
            'account_email' => $data['user']['emailAddress'] ?? null,
            'account_name' => $data['user']['displayName'] ?? null,
            'quota_limit' => isset($quota['limit']) ? (int) $quota['limit'] : null,
            'quota_usage' => isset($quota['usage']) ? (int) $quota['usage'] : null,
            'quota_usage_in_drive' => isset($quota['usageInDrive']) ? (int) $quota['usageInDrive'] : null,
            'quota_updated_at' => Database::now(),
        ]);
        return $data;
    }

    public static function ensureRootFolder(): string
    {
        $s = self::settings(true);
        if (!empty($s['root_folder_id'])) {
            try {
                $f = self::getFile($s['root_folder_id'], 'id,trashed');
                if (empty($f['trashed'])) {
                    return $s['root_folder_id'];
                }
            } catch (DriveException $e) {
                if ($e->reason !== 'not_found') {
                    throw $e;
                }
            }
        }
        $folder = self::createFolder(Settings::appName(), null, 'Private storage folder managed by Bladezux Cloud Storage.');
        self::update(['root_folder_id' => $folder['id']]);
        Activity::log('drive.root', 'Created application folder "' . Settings::appName() . '" in Google Drive', 'drive', $folder['id']);
        return $folder['id'];
    }

    public static function rootFolderId(): string
    {
        if (!self::isConnected()) {
            throw new DriveException('Google Drive is not connected. The owner must connect it in Settings → Google Drive.', 503, 'disconnected');
        }
        return (string) self::settings()['root_folder_id'];
    }

    public static function createFolder(string $name, ?string $parentId, string $description = ''): array
    {
        $meta = ['name' => $name, 'mimeType' => self::FOLDER_MIME];
        if ($parentId) {
            $meta['parents'] = [$parentId];
        }
        if ($description !== '') {
            $meta['description'] = $description;
        }
        [, , $data] = self::api('POST', '/files', ['fields' => 'id,name', 'supportsAllDrives' => 'true'], $meta);
        return $data;
    }

    public static function getFile(string $id, string $fields = self::FILE_FIELDS): array
    {
        [, , $data] = self::api('GET', '/files/' . rawurlencode($id), ['fields' => $fields, 'supportsAllDrives' => 'true']);
        return $data;
    }

    public static function rename(string $id, string $name): array
    {
        [, , $data] = self::api('PATCH', '/files/' . rawurlencode($id), ['fields' => 'id,name', 'supportsAllDrives' => 'true'], ['name' => $name]);
        return $data;
    }

    public static function move(string $id, string $newParent, string $oldParent): array
    {
        [, , $data] = self::api('PATCH', '/files/' . rawurlencode($id), [
            'addParents' => $newParent,
            'removeParents' => $oldParent,
            'fields' => 'id,parents',
            'supportsAllDrives' => 'true',
        ], []);
        return $data;
    }

    /** Moves the item to the Google Drive trash (recoverable for 30 days). */
    public static function trash(string $id): void
    {
        try {
            self::api('PATCH', '/files/' . rawurlencode($id), ['fields' => 'id', 'supportsAllDrives' => 'true'], ['trashed' => true]);
        } catch (DriveException $e) {
            if ($e->reason !== 'not_found') {
                throw $e;
            }
        }
    }

    /** @return array<int, array> all children (paginated) */
    public static function listChildren(string $parentId): array
    {
        $items = [];
        $pageToken = null;
        do {
            $query = [
                'q' => sprintf("'%s' in parents and trashed = false", str_replace("'", "\\'", $parentId)),
                'fields' => 'nextPageToken,files(' . self::FILE_FIELDS . ')',
                'pageSize' => 1000,
                'supportsAllDrives' => 'true',
                'includeItemsFromAllDrives' => 'true',
            ];
            if ($pageToken) {
                $query['pageToken'] = $pageToken;
            }
            [, , $data] = self::api('GET', '/files', $query);
            $items = array_merge($items, $data['files'] ?? []);
            $pageToken = $data['nextPageToken'] ?? null;
        } while ($pageToken);
        return $items;
    }

    // ------------------------------------------------------- resumable upload

    /**
     * Starts a resumable upload session. The Origin header binds the session to
     * this site so the browser may PUT chunks directly (CORS) to Google.
     */
    public static function createResumableSession(string $name, string $mime, int $size, string $parentId): string
    {
        [, $headers] = self::api('POST', '/files', [
            'uploadType' => 'resumable',
            'supportsAllDrives' => 'true',
            'fields' => self::FILE_FIELDS,
        ], ['name' => $name, 'parents' => [$parentId], 'mimeType' => $mime], 'upload_url', [
            'X-Upload-Content-Type: ' . $mime,
            'X-Upload-Content-Length: ' . $size,
            'Origin: ' . App::origin(),
        ]);
        $location = $headers['location'] ?? '';
        if (!str_starts_with($location, 'https://') && !str_starts_with($location, 'http://')) {
            throw new DriveException('Google Drive did not create an upload session. Please try again.', 502, 'no_session');
        }
        return $location;
    }

    /**
     * Interprets a response from the session URI.
     * @return array{state:string, offset:int, file:?array}
     */
    private static function sessionResult(int $status, array $headers, string $body): array
    {
        if ($status === 200 || $status === 201) {
            return ['state' => 'complete', 'offset' => -1, 'file' => json_decode($body, true)];
        }
        if ($status === 308) {
            $offset = 0;
            if (!empty($headers['range']) && preg_match('/bytes=0-(\d+)/', $headers['range'], $m)) {
                $offset = (int) $m[1] + 1;
            }
            return ['state' => 'incomplete', 'offset' => $offset, 'file' => null];
        }
        if ($status === 404 || $status === 410) {
            return ['state' => 'expired', 'offset' => 0, 'file' => null];
        }
        $data = json_decode($body, true);
        $reason = is_array($data) ? (string) ($data['error']['errors'][0]['reason'] ?? '') : '';
        throw self::errorFor($status, $reason, is_array($data) ? (string) ($data['error']['message'] ?? '') : '');
    }

    /** Asks Google how many bytes of the session have been persisted. */
    public static function querySession(string $sessionUri, int $total): array
    {
        [$status, $headers, $body] = self::curl('PUT', $sessionUri, [
            'Content-Length: 0',
            'Content-Range: bytes */' . $total,
        ], '', null, null, 30);
        return self::sessionResult($status, $headers, $body);
    }

    /** Server-side relay of one chunk (fallback when direct browser upload is blocked). */
    public static function putChunk(string $sessionUri, string $data, int $offset, int $total): array
    {
        $end = $offset + strlen($data) - 1;
        [$status, $headers, $body] = self::curl('PUT', $sessionUri, [
            'Content-Range: bytes ' . $offset . '-' . $end . '/' . $total,
            'Content-Type: application/octet-stream',
        ], $data, null, null, 600);
        return self::sessionResult($status, $headers, $body);
    }

    public static function cancelSession(string $sessionUri): void
    {
        try {
            self::curl('DELETE', $sessionUri, [], null, null, null, 15);
        } catch (\Throwable) {
            // Session will expire on its own after one week.
        }
    }

    // --------------------------------------------------------------- download

    /**
     * Streams file media to the client with HTTP Range support.
     */
    public static function streamMedia(string $fileId, ?string $range, callable $onHeaders): int
    {
        $url = self::endpoint('api_url') . '/files/' . rawurlencode($fileId) . '?alt=media&supportsAllDrives=true';
        $headers = ['Authorization: Bearer ' . self::accessToken()];
        if ($range !== null && preg_match('/^bytes=\d*-\d*$/', $range)) {
            $headers[] = 'Range: ' . $range;
        }
        $finalStatus = 0;
        self::curl('GET', $url, $headers, null, static function (string $data) use (&$finalStatus): bool {
            if ($finalStatus !== 200 && $finalStatus !== 206) {
                return true; // swallow error bodies
            }
            echo $data;
            flush();
            return connection_aborted() === 0;
        }, static function (int $status, array $h) use ($onHeaders, &$finalStatus): void {
            if ($status >= 100 && $status < 200) {
                return;
            }
            $finalStatus = $status;
            if ($status === 200 || $status === 206) {
                $onHeaders($status, $h);
            }
        }, 0);
        return $finalStatus;
    }

    public static function fetchThumbnail(string $link): ?array
    {
        // Only send the access token to Google-owned hosts (or the configured API host).
        $host = (string) parse_url($link, PHP_URL_HOST);
        $trusted = $host === parse_url(self::endpoint('api_url'), PHP_URL_HOST)
            || preg_match('/(^|\.)(googleusercontent|googleapis|google)\.com$/', $host);
        if (!str_starts_with($link, 'https://') && !$trusted) {
            return null;
        }
        $headers = $trusted ? ['Authorization: Bearer ' . self::accessToken()] : [];
        [$status, $headers, $body] = self::curl('GET', $link, $headers, null, null, null, 20);
        if ($status !== 200 || $body === '') {
            return null;
        }
        return ['type' => $headers['content-type'] ?? 'image/jpeg', 'body' => $body];
    }
}
