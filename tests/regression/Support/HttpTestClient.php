<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use RuntimeException;

final class HttpTestClient
{
    /** @var string */
    private $baseUrl;

    public function __construct(?string $baseUrl = null)
    {
        $this->baseUrl = rtrim($baseUrl ?: (string)getenv('REGRESSION_HTTP_BASE_URL'), '/');
        if ($this->baseUrl === '') {
            throw new RuntimeException('REGRESSION_HTTP_BASE_URL is not configured');
        }
    }

    /**
     * @param array<string, string> $extraHeaders endpoints that read a named
     *        header instead of `Authorization`; adminapi expects `Authori-zation`
     *        (cookie.token_name)
     */
    public function request(string $method, string $path, ?string $token, array $body = [], array $extraHeaders = []): array
    {
        $url = parse_url($this->baseUrl . '/' . ltrim($path, '/'));
        if (!is_array($url) || empty($url['host'])) {
            throw new RuntimeException('Invalid regression HTTP base URL');
        }
        $host = $url['host'];
        $port = (int)($url['port'] ?? 80);
        $target = ($url['path'] ?? '/') . (isset($url['query']) ? '?' . $url['query'] : '');
        $payload = $body ? json_encode($body, JSON_UNESCAPED_SLASHES) : '';
        if ($payload === false) {
            throw new RuntimeException('Unable to encode request body');
        }

        $headers = [
            strtoupper($method) . ' ' . $target . ' HTTP/1.1',
            'Host: ' . $host,
            'Accept: application/json',
            'Connection: close',
        ];
        if ($token !== null) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }
        foreach ($extraHeaders as $name => $value) {
            $headers[] = $name . ': ' . $value;
        }
        if ($payload !== '') {
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($payload);
        }

        $started = microtime(true);
        $socket = @fsockopen($host, $port, $errorNumber, $errorMessage, 3.0);
        if (!$socket) {
            throw new RuntimeException("HTTP connection failed: {$errorNumber} {$errorMessage}");
        }
        stream_set_timeout($socket, 10);
        fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . $payload);
        $response = '';
        while (!feof($socket)) {
            if (microtime(true) - $started > 10.0) {
                fclose($socket);
                throw new RuntimeException('HTTP request exceeded 10 seconds');
            }
            $response .= (string)fread($socket, 8192);
        }
        $metadata = stream_get_meta_data($socket);
        fclose($socket);
        if (!empty($metadata['timed_out'])) {
            throw new RuntimeException('HTTP request timed out');
        }

        [$rawHeaders, $rawBody] = array_pad(explode("\r\n\r\n", $response, 2), 2, '');
        $headerLines = explode("\r\n", $rawHeaders);
        if (!preg_match('/^HTTP\/\S+\s+(\d{3})/', array_shift($headerLines) ?: '', $matches)) {
            throw new RuntimeException('Invalid HTTP response');
        }
        $responseHeaders = [];
        foreach ($headerLines as $line) {
            if (strpos($line, ':') !== false) {
                [$name, $value] = explode(':', $line, 2);
                $responseHeaders[strtolower(trim($name))] = trim($value);
            }
        }
        if (strtolower($responseHeaders['transfer-encoding'] ?? '') === 'chunked') {
            $rawBody = $this->decodeChunkedBody($rawBody);
        }
        $decoded = json_decode($rawBody, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('HTTP response is not JSON: ' . substr($rawBody, 0, 200));
        }
        return ['http_status' => (int)$matches[1], 'headers' => $responseHeaders, 'body' => $decoded];
    }

    private function decodeChunkedBody(string $body): string
    {
        $decoded = '';
        while ($body !== '') {
            $lineEnd = strpos($body, "\r\n");
            if ($lineEnd === false) {
                break;
            }
            $length = hexdec(trim(substr($body, 0, $lineEnd)));
            if ($length === 0) {
                break;
            }
            $decoded .= substr($body, $lineEnd + 2, $length);
            $body = substr($body, $lineEnd + 2 + $length + 2);
        }
        return $decoded;
    }
}
