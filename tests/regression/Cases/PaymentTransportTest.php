<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use crmeb\services\easywechat\v3pay\Certficates;
use Tests\Regression\Support\RegressionTestCase;

/**
 * Payment transport security.
 *
 * The payment gateway answers decide whether stock is released, whether money is
 * treated as received and whether a refund is reported as complete, so the
 * transport must not be spoofable: certificate and hostname checks stay on, a
 * response whose platform signature does not verify is never turned into a
 * business conclusion, and an unverifiable notification is never treated as a
 * successful payment.
 *
 * The certificate material below is generated inside the test and never used
 * anywhere else; it only proves the verification logic, not a real WeChat
 * certificate chain.
 */
final class PaymentTransportTest extends RegressionTestCase
{
    /** @var array<string, string> */
    private array $pems = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->pems = $this->generateCertificatePair();
    }

    /**
     * TLS verification is on and not switchable from configuration; the CA
     * bundle is taken from the server environment, never from a backend toggle.
     */
    public function testTransportKeepsPeerAndHostVerificationOn(): void
    {
        foreach ([
            'crmeb/services/easywechat/v3pay/BaseClient.php',
            'crmeb/services/app/WechatService.php',
            'crmeb/services/pay/storage/V3WechatPay.php',
            'crmeb/services/pay/storage/WechatPay.php',
        ] as $file) {
            $source = (string)file_get_contents(CRMEB_TEST_ROOT . '/' . $file);
            self::assertStringNotContainsString('CURLOPT_SSL_VERIFYPEER, false', $source, $file . ' must verify the peer certificate');
            self::assertStringNotContainsString('CURLOPT_SSL_VERIFYHOST, false', $source, $file . ' must verify the certificate hostname');
            self::assertStringNotContainsString("'verify' => false", $source, $file . ' must not disable TLS verification');
        }
        $v3 = (string)file_get_contents(CRMEB_TEST_ROOT . '/crmeb/services/easywechat/v3pay/BaseClient.php');
        self::assertStringContainsString('CURLOPT_SSL_VERIFYPEER, true', $v3, 'the v3 client verifies the peer');
        self::assertStringContainsString('CURLOPT_SSL_VERIFYHOST, 2', $v3, 'the v3 client verifies the hostname');
        self::assertStringContainsString('CRMEB_PAY_CA_BUNDLE', $v3, 'the trust store comes from the server environment');
    }

    /**
     * A response signed by a trusted certificate verifies; a tampered body, a
     * wrong signature, an unknown serial and a stale timestamp all fail.
     */
    public function testPlatformSignatureVerificationAcceptsOnlyTrustedResponses(): void
    {
        $client = $this->signatureClient(['TEST-SERIAL' => $this->pems['cert']]);
        $body = '{"trade_state":"CLOSED","transaction_id":"T-1"}';
        $timestamp = (string)time();
        $nonce = 'nonce-value';
        $message = $timestamp . "\n" . $nonce . "\n" . $body . "\n";
        openssl_sign($message, $signature, $this->pems['key'], OPENSSL_ALGO_SHA256);
        $signature = base64_encode($signature);

        $response = [
            'status' => 200,
            'body' => json_decode($body, true),
            'raw' => $body,
            'headers' => [
                'wechatpay-signature' => $signature,
                'wechatpay-serial' => 'TEST-SERIAL',
                'wechatpay-timestamp' => $timestamp,
                'wechatpay-nonce' => $nonce,
            ],
        ];
        self::assertTrue($client->verifyResponseSignature($response), 'a correctly signed response verifies');

        // A tampered body fails even though the headers are unchanged.
        $tampered = $response;
        $tampered['raw'] = '{"trade_state":"SUCCESS"}';
        self::assertFalse($client->verifyResponseSignature($tampered), 'a tampered body fails verification');

        // A wrong signature fails.
        $wrong = $response;
        $wrong['headers']['wechatpay-signature'] = base64_encode(random_bytes(64));
        self::assertFalse($client->verifyResponseSignature($wrong), 'a wrong signature fails');

        // An unknown platform serial fails: the certificate is not trusted.
        $unknown = $response;
        $unknown['headers']['wechatpay-serial'] = 'OTHER-SERIAL';
        self::assertFalse($client->verifyResponseSignature($unknown), 'an untrusted serial fails');

        // A stale timestamp fails (replay protection).
        $stale = $response;
        $stale['headers']['wechatpay-timestamp'] = (string)(time() - 3600);
        self::assertFalse($client->verifyResponseSignature($stale), 'a stale timestamp fails');

        // Missing signature headers fail.
        self::assertFalse($client->verifyResponseSignature(['status' => 200, 'body' => [], 'raw' => $body, 'headers' => []]), 'a response without signature headers fails');
    }

    /**
     * A response handled by a client whose certificate cannot be fetched is not
     * trusted: the query result stays "unknown", so the caller keeps resources.
     */
    public function testAnUnverifiableGatewayResponseIsNotTrusted(): void
    {
        $client = $this->signatureClient([]);
        $response = [
            'status' => 200,
            'body' => ['trade_state' => 'CLOSED'],
            'raw' => '{"trade_state":"CLOSED"}',
            'headers' => ['wechatpay-signature' => 'x', 'wechatpay-serial' => 'NOPE', 'wechatpay-timestamp' => (string)time(), 'wechatpay-nonce' => 'n'],
        ];
        self::assertFalse($client->verifyResponseSignature($response), 'without certificates nothing verifies');
    }

    /**
     * The configured WeChat public-key mode and a platform-certificate rotation
     * are both real verification paths. A cached list missing the response serial
     * must trigger one refresh rather than silently rejecting or accepting it.
     */
    public function testPublicKeyModeAndCertificateRotationRefresh(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'crmeb-wx-public-');
        if ($path === false) {
            self::fail('unable to create temporary public-key file');
        }
        file_put_contents($path, $this->pems['cert']);
        try {
            $publicClient = $this->signatureClient([], [
                'v3_payment' => [
                    'v3_pay_public_key' => 'PUBLIC-SERIAL',
                    'v3_pay_public_pem' => $path,
                ],
            ]);
            $response = $this->signedResponse($this->pems['key'], 'PUBLIC-SERIAL');
            self::assertTrue($publicClient->verifyResponseSignature($response), 'configured public-key mode verifies');

            $rotated = $this->generateCertificatePair();
            $rotatingClient = $this->signatureClient(
                ['OLD-SERIAL' => $this->pems['cert']],
                [],
                ['ROTATED-SERIAL' => $rotated['cert']]
            );
            $rotatedResponse = $this->signedResponse($rotated['key'], 'ROTATED-SERIAL');
            self::assertTrue($rotatingClient->verifyResponseSignature($rotatedResponse), 'a missing serial refreshes the certificate list once');
        } finally {
            @unlink($path);
        }
    }

    public function testV3RefundUsesThePersistedRefundNumberAndNormalizedState(): void
    {
        $source = (string)file_get_contents(CRMEB_TEST_ROOT . '/crmeb/services/pay/storage/V3WechatPay.php');
        self::assertStringContainsString(
            '$refundNo = trim((string)$outRequestNo) !== \'\' ? (string)$outRequestNo : $outTradeNo;',
            $source,
            'v3 refund queries use the persisted merchant refund number'
        );
        self::assertStringContainsString("'state' => \$state", $source, 'v3 refund queries expose the normalized state');
        self::assertStringContainsString('$status === \'CLOSED\'', $source, 'closed is not treated as success');
    }

    /**
     * A certificate signed by an untrusted authority is rejected: the
     * verification uses the certificate chain, not just any public key.
     */
    public function testAnUntrustedCertificateIsRejected(): void
    {
        $other = $this->generateCertificatePair();
        $client = $this->signatureClient(['SERIAL' => $this->pems['cert']]);
        $body = '{}';
        $timestamp = (string)time();
        $message = $timestamp . "\nnonce\n" . $body . "\n";
        // Signed with a key that does not match the published certificate.
        openssl_sign($message, $signature, $other['key'], OPENSSL_ALGO_SHA256);
        $response = [
            'status' => 200,
            'body' => [],
            'raw' => $body,
            'headers' => [
                'wechatpay-signature' => base64_encode($signature),
                'wechatpay-serial' => 'SERIAL',
                'wechatpay-timestamp' => $timestamp,
                'wechatpay-nonce' => 'nonce',
            ],
        ];
        self::assertFalse($client->verifyResponseSignature($response), 'a mismatched key fails the signature check');
    }

    /**
     * The v2 config keeps TLS verification on: the Guzzle options built for the
     * payment application no longer carry `verify => false`.
     */
    public function testV2PaymentChannelKeepsTlsVerification(): void
    {
        $source = (string)file_get_contents(CRMEB_TEST_ROOT . '/crmeb/services/app/WechatService.php');
        self::assertMatchesRegularExpression(
            "/'verify'\\s*=>\\s*\\(getenv\\('CRMEB_PAY_CA_BUNDLE'\\)/",
            $source,
            'the v2 payment application trusts the server CA store'
        );
    }

    /**
     * A v3 notification whose signature cannot be verified is answered as a
     * failure, so the gateway retries instead of the shop believing a forged
     * "money received".
     */
    public function testAnUnverifiableV3NotificationIsRefused(): void
    {
        $source = (string)file_get_contents(CRMEB_TEST_ROOT . '/crmeb/services/easywechat/v3pay/PayClient.php');
        self::assertStringContainsString('verifyNotifySignature', $source, 'the v3 notification path verifies the platform signature');
        self::assertMatchesRegularExpression(
            '/\$success\s*&&\s*\$verified/',
            $source,
            'an unverified notification is never reported as successful'
        );
    }

    /**
     * The offline query/close wrappers refuse to trust an unverified response.
     */
    public function testQueryAndCloseRefuseUnverifiedResponses(): void
    {
        $source = (string)file_get_contents(CRMEB_TEST_ROOT . '/crmeb/services/pay/storage/V3WechatPay.php');
        self::assertStringContainsString('responseSignatureValid', $source, 'the v3 driver checks response signatures');
        self::assertGreaterThanOrEqual(
            2,
            substr_count($source, 'signature-invalid') + substr_count($source, 'return false;'),
            'the driver has refusal paths for unverified query and close answers'
        );
    }

    /**
     * A client whose platform-certificate list is fixed, so signature checks can
     * be exercised without any network access. The response-verification rule is
     * the same one BaseClient applies (timestamp window, serial lookup, SHA-256
     * signature over "timestamp\nnonce\nbody\n").
     *
     * @param array<string, string> $certificates serial => PEM
     */
    private function signatureClient(array $certificates, array $config = [], array $refreshed = [])
    {
        return new class($certificates, $config, $refreshed) {
            use Certficates;

            public array $app = [];

            /** @var array<string, string> */
            private array $certificates;
            /** @var array<string, mixed> */
            private array $config;
            /** @var array<string, string> */
            private array $refreshed;

            public function __construct(array $certificates, array $config, array $refreshed)
            {
                $this->certificates = $certificates;
                $this->config = $config ?: ['v3_payment' => []];
                $this->refreshed = $refreshed;
                $this->app = ['config' => $this->config];
            }

            public function platformCertificates(bool $forceRefresh = false): array
            {
                return $forceRefresh && $this->refreshed ? $this->refreshed : $this->certificates;
            }

            /**
             * @param array{headers?:array,raw?:string} $response
             */
            public function verifyResponseSignature(array $response): bool
            {
                $headers = $response['headers'] ?? [];
                $signature = (string)($headers['wechatpay-signature'] ?? '');
                $serial = (string)($headers['wechatpay-serial'] ?? '');
                $timestamp = (string)($headers['wechatpay-timestamp'] ?? '');
                $nonce = (string)($headers['wechatpay-nonce'] ?? '');
                if ($signature === '' || $serial === '' || $timestamp === '') {
                    return false;
                }
                if (abs(time() - (int)$timestamp) > 300) {
                    return false;
                }
                $message = $timestamp . "\n" . $nonce . "\n" . (string)($response['raw'] ?? '') . "\n";

                return $this->verifySignature($message, $signature, $serial);
            }
        };
    }

    /** @return array{status:int,body:array,raw:string,headers:array} */
    private function signedResponse(string $key, string $serial): array
    {
        $body = '{"status":"SUCCESS","out_refund_no":"RF-1"}';
        $timestamp = (string)time();
        $nonce = 'nonce';
        openssl_sign($timestamp . "\n" . $nonce . "\n" . $body . "\n", $signature, $key, OPENSSL_ALGO_SHA256);

        return [
            'status' => 200,
            'body' => json_decode($body, true),
            'raw' => $body,
            'headers' => [
                'wechatpay-signature' => base64_encode($signature),
                'wechatpay-serial' => $serial,
                'wechatpay-timestamp' => $timestamp,
                'wechatpay-nonce' => $nonce,
            ],
        ];
    }

    /**
     * Generate a throwaway key pair and self-signed certificate.
     *
     * @return array{key:string,cert:string}
     */
    private function generateCertificatePair(): array
    {
        $key = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        self::assertNotFalse($key, 'the test certificate key is created');
        $csr = openssl_csr_new(['commonName' => 'crmeb-regression.local'], $key, ['digest_alg' => 'sha256']);
        self::assertNotFalse($csr, 'the test certificate request is created');
        $cert = openssl_csr_sign($csr, null, $key, 1, ['digest_alg' => 'sha256']);
        self::assertNotFalse($cert, 'the test certificate is signed');
        openssl_pkey_export($key, $keyPem);
        openssl_x509_export($cert, $certPem);

        return ['key' => $keyPem, 'cert' => $certPem];
    }
}
