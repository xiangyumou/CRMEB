<?php
/**
 * Container role health probe.
 *
 * Every application container runs this script as its Docker healthcheck, so it
 * has to work with nothing but the runtime image: it reads .env directly and
 * never boots the framework. A probe that needs the framework cannot report
 * that the framework itself is broken.
 *
 * Roles:
 *   php        real FastCGI request through php-fpm for the readiness script
 *   queue      freshness of the heartbeat the queue worker writes per job
 *   timer      freshness of the heartbeat the scheduler writes
 *   workerman  application level round trip through the Channel server
 *
 * Exit code 0 means healthy, anything else means unhealthy, and the failing
 * reason is written to stderr so `docker inspect` and `docker compose ps` show
 * what broke without exposing it on the public /readyz endpoint.
 */
declare(strict_types=1);

const HEALTH_ENV_FILE = '/var/www/crmeb/.env';
const HEALTH_HEARTBEAT_PREFIX = 'crmeb:health:';
/**
 * Heartbeats are written every 30 seconds, so 150 seconds tolerates four missed
 * rounds before a container is reported unhealthy.
 */
const HEALTH_HEARTBEAT_MAX_AGE = 150;
const HEALTH_TIMEOUT = 5.0;
const HEALTH_FCGI_SCRIPT = '/opt/crmeb/ready.php';
const HEALTH_FCGI_URI = '/readyz';

/**
 * Minimal FastCGI client.
 *
 * Requesting the readiness script over php-fpm is the only check that proves
 * the pool is alive and can execute PHP; opening a TCP socket to port 9000 only
 * proves the port is bound.
 *
 * @return array{status:int,body:string,stderr:string}|null null when nothing answered
 */
function healthFastcgiRequest(string $script, string $uri, string $host = '127.0.0.1'): ?array
{
    $socket = @stream_socket_client('tcp://' . $host . ':9000', $errno, $error, HEALTH_TIMEOUT);
    if (!$socket) {
        return null;
    }
    stream_set_timeout($socket, (int)ceil(HEALTH_TIMEOUT));

    $params = [
        'GATEWAY_INTERFACE' => 'FastCGI/1.0',
        'REQUEST_METHOD' => 'GET',
        'SCRIPT_FILENAME' => $script,
        'SCRIPT_NAME' => $uri,
        'REQUEST_URI' => $uri,
        'DOCUMENT_URI' => $uri,
        'QUERY_STRING' => '',
        'SERVER_PROTOCOL' => 'HTTP/1.1',
        'SERVER_SOFTWARE' => 'crmeb-healthcheck',
        'SERVER_NAME' => 'localhost',
        'SERVER_ADDR' => $host,
        'SERVER_PORT' => '9000',
        'REMOTE_ADDR' => '127.0.0.1',
        'REMOTE_PORT' => '0',
        'CONTENT_LENGTH' => '0',
        'CONTENT_TYPE' => '',
        'HTTP_HOST' => 'localhost',
    ];

    // Records are (type, requestId, content). BEGIN_REQUEST must carry the 8 byte
    // role header, the parameters travel in their own PARAMS record, and php-fpm
    // drops the connection without a reply when either record is malformed.
    $payload = healthFastcgiRecord(1, 1, pack('nCCCCCC', 1, 0, 0, 0, 0, 0, 0))
        . healthFastcgiRecord(4, 1, healthFastcgiParams($params))
        . healthFastcgiRecord(4, 1, '')
        . healthFastcgiRecord(5, 1, '');
    if (@fwrite($socket, $payload) === false) {
        fclose($socket);
        return null;
    }

    $pending = '';
    $stdout = '';
    $stderr = '';
    $finished = false;
    $deadline = microtime(true) + HEALTH_TIMEOUT;
    while (!$finished && microtime(true) < $deadline) {
        $chunk = fread($socket, 8192);
        if ($chunk === false) {
            break;
        }
        if ($chunk === '') {
            $meta = stream_get_meta_data($socket);
            if (!empty($meta['timed_out']) || feof($socket)) {
                break;
            }
            continue;
        }
        $pending .= $chunk;
        while (strlen($pending) >= 8) {
            $header = unpack('Cversion/Ctype/nrequestId/ncontentLength/CpaddingLength/Creserved', substr($pending, 0, 8));
            $total = 8 + $header['contentLength'] + $header['paddingLength'];
            if (strlen($pending) < $total) {
                break;
            }
            $content = substr($pending, 8, $header['contentLength']);
            $pending = substr($pending, $total);
            if ($header['type'] === 6) {
                $stdout .= $content;
            } elseif ($header['type'] === 7) {
                $stderr .= $content;
            } elseif ($header['type'] === 3) {
                $finished = true;
                break;
            }
        }
    }
    fclose($socket);

    [$status, $body] = healthSplitCgiResponse($stdout);
    return ['status' => $status, 'body' => $body, 'stderr' => $stderr];
}

/** @return array{0:int,1:string} */
function healthSplitCgiResponse(string $response): array
{
    $separator = strpos($response, "\r\n\r\n");
    $length = 4;
    if ($separator === false) {
        $separator = strpos($response, "\n\n");
        $length = 2;
    }
    if ($separator === false) {
        return [200, $response];
    }
    $headers = substr($response, 0, $separator);
    $body = substr($response, $separator + $length);
    $status = 200;
    foreach (preg_split('/\r\n|\n/', $headers) as $line) {
        if (stripos($line, 'Status:') === 0) {
            $status = (int)trim(substr($line, 7));
            break;
        }
    }
    return [$status, $body];
}

/** @param array<string,string> $params */
function healthFastcgiParams(array $params): string
{
    $encoded = '';
    foreach ($params as $name => $value) {
        $encoded .= healthFastcgiLength(strlen($name)) . healthFastcgiLength(strlen($value))
            . $name . $value;
    }
    return $encoded;
}

function healthFastcgiLength(int $length): string
{
    return $length < 128 ? chr($length) : pack('N', $length | 0x80000000);
}

function healthFastcgiRecord(int $type, int $requestId, string $content): string
{
    $padding = (8 - (strlen($content) % 8)) % 8;
    return pack('CCnnCC', 1, $type, $requestId, strlen($content), $padding, 0)
        . $content . str_repeat("\0", $padding);
}

/**
 * Application level round trip through the Channel server.
 *
 * A bare ping only proves a port answers. Subscribing to a private channel and
 * publishing on it comes back through Workerman's event loop, so it proves the
 * long running process is scheduling and dispatching messages.
 */
function healthChannelRoundTrip(string $host, int $port): void
{
    $socket = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $error, HEALTH_TIMEOUT);
    if (!$socket) {
        throw new RuntimeException(sprintf('%s:%d is unreachable (%s)', $host, $port, $error ?: 'no reason given'));
    }
    stream_set_timeout($socket, (int)ceil(HEALTH_TIMEOUT));

    // 每次探测使用独立频道，避免和其它探针或业务消息互相串扰
    $channel = 'crmeb_health_probe_' . getmypid() . '_' . bin2hex(random_bytes(4));
    $subscribe = healthChannelFrame(serialize(['type' => 'subscribe', 'channels' => [$channel]]));
    $publish = healthChannelFrame(serialize(['type' => 'publish', 'channels' => [$channel], 'data' => 'probe']));
    if (@fwrite($socket, $subscribe . $publish) === false) {
        fclose($socket);
        throw new RuntimeException(sprintf('%s:%d accepted the connection but not the probe', $host, $port));
    }

    $pending = '';
    $deadline = microtime(true) + HEALTH_TIMEOUT;
    while (microtime(true) < $deadline) {
        $chunk = fread($socket, 8192);
        if ($chunk === false) {
            break;
        }
        if ($chunk === '') {
            $meta = stream_get_meta_data($socket);
            if (!empty($meta['timed_out']) || feof($socket)) {
                break;
            }
            continue;
        }
        $pending .= $chunk;
        while (strlen($pending) >= 4) {
            $frame = unpack('Ntotal', substr($pending, 0, 4));
            $total = (int)$frame['total'];
            if ($total < 4 || $total > 1048576) {
                fclose($socket);
                throw new RuntimeException(sprintf('%s:%d sent a malformed frame', $host, $port));
            }
            if (strlen($pending) < $total) {
                break;
            }
            $body = substr($pending, 4, $total - 4);
            $pending = substr($pending, $total);
            if (strpos($body, $channel) !== false) {
                fclose($socket);
                return;
            }
        }
    }
    fclose($socket);
    throw new RuntimeException(sprintf('%s:%d did not deliver the probe message back', $host, $port));
}

function healthChannelFrame(string $body): string
{
    return pack('N', 4 + strlen($body)) . $body;
}

/** @param array<string,string> $redisConfig */
function healthRedisGet(array $redisConfig, string $key): ?string
{
    $host = (string)($redisConfig['redis_hostname'] ?? '');
    $port = (int)($redisConfig['port'] ?? 0);
    if ($host === '' || $port <= 0) {
        throw new RuntimeException('redis is not configured');
    }
    if (!class_exists('Redis')) {
        throw new RuntimeException('the redis extension is unavailable');
    }
    $redis = new Redis();
    if (!$redis->connect($host, $port, HEALTH_TIMEOUT)) {
        throw new RuntimeException('redis is unreachable');
    }
    $password = (string)($redisConfig['redis_password'] ?? '');
    if ($password !== '') {
        $redis->auth($password);
    }
    $redis->select((int)($redisConfig['select'] ?? 0));
    $value = $redis->get($key);
    $redis->close();
    return $value === false || $value === null ? null : (string)$value;
}

/** @param array<string,string> $redisConfig */
function healthCheckHeartbeat(string $role, array $redisConfig): void
{
    $key = HEALTH_HEARTBEAT_PREFIX . $role;
    $value = healthRedisGet($redisConfig, $key);
    if ($value === null) {
        throw new RuntimeException($key . ' has never been written');
    }
    $age = time() - (int)$value;
    if ($age > HEALTH_HEARTBEAT_MAX_AGE) {
        throw new RuntimeException(sprintf('%s is %d seconds old', $key, $age));
    }
}

function healthCheckPhp(): void
{
    $response = healthFastcgiRequest(HEALTH_FCGI_SCRIPT, HEALTH_FCGI_URI);
    if ($response === null) {
        throw new RuntimeException('php-fpm did not answer on 127.0.0.1:9000');
    }
    if (trim($response['stderr']) !== '') {
        throw new RuntimeException('the readiness script wrote to stderr: ' . trim($response['stderr']));
    }
    if ($response['status'] !== 200) {
        throw new RuntimeException('the readiness script returned status ' . $response['status']);
    }
    if (strpos($response['body'], '"ready":true') === false) {
        throw new RuntimeException('the readiness script did not report ready');
    }
}

/**
 * Workerman health: a Channel round trip through the address the role is
 * CONFIGURED to use.
 *
 * The fallback to 127.0.0.1 is deliberately gone. Inside the workerman container
 * that address is the local Channel server, so a misconfigured CLIENT_IP passed
 * the check while every other container (php, queue, timer) was cut off from the
 * channel — the probe reported green on exactly the failure it exists to catch.
 * A role must prove the address its own configuration names.
 *
 * @param array<string,string> $channelConfig
 */
function healthCheckWorkerman(array $channelConfig): void
{
    $port = (int)($channelConfig['port'] ?? 40003);
    $configured = trim((string)($channelConfig['client_ip'] ?? ''));
    if ($configured === '') {
        throw new RuntimeException('CHANNEL.CLIENT_IP is not configured');
    }
    healthChannelRoundTrip($configured, $port);
}

/**
 * Queue and timer roles depend on the Channel connection their configuration
 * names: a fresh heartbeat alone would not notice a channel address that no
 * longer resolves, and the queue worker would silently stop receiving work.
 *
 * @param string $role
 * @param array<string,string> $redisConfig
 * @param array<string,string> $channelConfig
 */
function healthCheckQueueRole(string $role, array $redisConfig, array $channelConfig): void
{
    healthCheckHeartbeat($role, $redisConfig);
    healthCheckWorkerman($channelConfig);
}

/** @return array{db:array<string,string>,redis:array<string,string>,channel:array<string,string>} */
function healthLoadSettings(): array
{
    $settings = @parse_ini_file(HEALTH_ENV_FILE, true, INI_SCANNER_RAW);
    if (!is_array($settings)) {
        throw new RuntimeException(HEALTH_ENV_FILE . ' is missing or unreadable');
    }
    return [
        'db' => array_change_key_case($settings['DATABASE'] ?? [], CASE_LOWER),
        'redis' => array_change_key_case($settings['REDIS'] ?? [], CASE_LOWER),
        'channel' => array_change_key_case($settings['CHANNEL'] ?? [], CASE_LOWER),
    ];
}

$healthRole = $argv[1] ?? '';
$healthRoles = ['php', 'queue', 'timer', 'workerman'];
if (!in_array($healthRole, $healthRoles, true)) {
    fwrite(STDERR, 'usage: healthcheck.php ' . implode('|', $healthRoles) . "\n");
    exit(2);
}

try {
    $healthSettings = healthLoadSettings();
    switch ($healthRole) {
        case 'php':
            healthCheckPhp();
            break;
        case 'queue':
        case 'timer':
            // 队列与定时任务都要证明它们配置的 Channel 地址可用：只查心跳会
            // 让"连不上 Channel 但进程还在跑"的实例保持健康
            healthCheckQueueRole($healthRole, $healthSettings['redis'], $healthSettings['channel']);
            break;
        case 'workerman':
            healthCheckWorkerman($healthSettings['channel']);
            break;
    }
} catch (Throwable $healthError) {
    fwrite(STDERR, 'unhealthy[' . $healthRole . ']: ' . $healthError->getMessage() . "\n");
    exit(1);
}

echo "healthy[" . $healthRole . "]\n";
