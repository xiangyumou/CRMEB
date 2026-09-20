<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use crmeb\services\pay\Pay;
use think\Container;

/**
 * An offline WeChat-pay gateway double whose state lives in the shared test
 * MySQL, so every process that participates in a test sees the same gateway:
 * the PHPUnit process, race workers, queue workers, and a process that died
 * mid-call. State survives process exit by construction — exactly the property
 * the payment tests need: a rolled-back local transaction cannot unsend a
 * gateway request. The double therefore writes through its OWN autocommit
 * connection (see TestConnection), never through the application's
 * transactional connection.
 *
 * It replaces ONLY the transport boundary. `Pay::class` is rebound (the same
 * seam `RecordingPay` uses), so `PayServices`, `PayTradeServices`, the refund
 * service and the notify pipeline all run their real code against it.
 *
 * The business state model is deliberately simple and faithful where it
 * matters: a gateway payment is open (money still owed), paid (money taken,
 * trade number assigned) or closed; a refund is processing or success; every
 * request is logged with its arguments. Scenario flags let a test script the
 * awkward truths of real transports:
 *   - create accepted, response lost (timeout)      -> respondTimeout()
 *   - payment lands before the response is returned -> payBeforeResponse()
 *   - close refused / close unconfirmable           -> failClose()
 *   - query unreachable (unknown state)             -> respondQueryTimeout()
 *   - refund accepted but response lost             -> holdRefundResponse()
 *   - hold a request at a chosen stage              -> holdOnBarrier()
 */
final class StatefulGateway extends Pay
{
    private const ORDER_TABLE = 'regression_gateway_order';
    private const REFUND_TABLE = 'regression_gateway_refund';
    private const REQUEST_TABLE = 'regression_gateway_request';
    private const SCENARIO_TABLE = 'regression_gateway_scenario';

    /** jsConfig shape the drivers normally return; afterPay() walks it. */
    private const FAKE_JSCONFIG = [
        'appId' => 'wx-test-appid',
        'timeStamp' => '1700000000',
        'nonceStr' => 'regression',
        'package' => 'prepay_id=regression',
        'signType' => 'MD5',
        'paySign' => 'regression-sign',
    ];

    /**
     * Install the backing tables and drop any leftover rows from earlier runs.
     */
    public static function fresh(): self
    {
        self::install();
        foreach ([self::ORDER_TABLE, self::REFUND_TABLE, self::REQUEST_TABLE, self::SCENARIO_TABLE] as $table) {
            TestConnection::exec(sprintf('DELETE FROM %s', TestConnection::table($table)));
        }

        return new self();
    }

    /**
     * Create the tables once.
     */
    public static function install(): void
    {
        $p = TestConnection::table('');
        TestConnection::exec(sprintf('CREATE TABLE IF NOT EXISTS %s (
            out_trade_no varchar(64) NOT NULL PRIMARY KEY,
            state varchar(16) NOT NULL DEFAULT "open",
            trade_no varchar(64) NOT NULL DEFAULT "",
            total_fee varchar(16) NOT NULL DEFAULT "0",
            fail_create tinyint NOT NULL DEFAULT 0,
            respond_timeout tinyint NOT NULL DEFAULT 0,
            pay_before_response tinyint NOT NULL DEFAULT 0,
            fail_close tinyint NOT NULL DEFAULT 0,
            fail_refund tinyint NOT NULL DEFAULT 0,
            query_timeout tinyint NOT NULL DEFAULT 0,
            close_timeout tinyint NOT NULL DEFAULT 0,
            hold_barrier varchar(64) NOT NULL DEFAULT "",
            created int NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', $p . self::ORDER_TABLE));
        TestConnection::exec(sprintf('CREATE TABLE IF NOT EXISTS %s (
            out_refund_no varchar(64) NOT NULL PRIMARY KEY,
            out_trade_no varchar(64) NOT NULL DEFAULT "",
            refund_fee varchar(16) NOT NULL DEFAULT "0",
            state varchar(16) NOT NULL DEFAULT "success",
            fail tinyint NOT NULL DEFAULT 0,
            hold_barrier varchar(64) NOT NULL DEFAULT "",
            created int NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', $p . self::REFUND_TABLE));
        TestConnection::exec(sprintf('CREATE TABLE IF NOT EXISTS %s (
            id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
            kind varchar(24) NOT NULL,
            out_trade_no varchar(64) NOT NULL DEFAULT "",
            refund_no varchar(64) NOT NULL DEFAULT "",
            payload text NULL,
            created int NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', $p . self::REQUEST_TABLE));
        TestConnection::exec(sprintf('CREATE TABLE IF NOT EXISTS %s (
            out_trade_no varchar(64) NOT NULL PRIMARY KEY,
            create_hold varchar(64) NOT NULL DEFAULT ""
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', $p . self::SCENARIO_TABLE));
        // Columns added to a table an earlier suite version already created.
        TestConnection::ensureColumn(self::ORDER_TABLE, 'fail_refund', 'tinyint NOT NULL DEFAULT 0');
    }

    /**
     * Bind this gateway as the Pay manager for the current process. Every
     * process that wants to reach the shared gateway must call this once
     * after bootstrapping the app.
     */
    public static function bind(): void
    {
        $container = Container::getInstance();
        $container->delete(Pay::class);
        $container->bind(Pay::class, function () {
            return new self();
        });
    }

    // ------------------------------------------------------------------
    // Scenario scripting
    // ------------------------------------------------------------------

    /** A gateway payment that exists before any local create() reached it. */
    public function seedOrder(string $outTradeNo, string $state = 'open', string $totalFee = '0.00'): void
    {
        TestConnection::exec(
            sprintf('INSERT INTO %s (out_trade_no, state, total_fee, created) VALUES (?, ?, ?, ?)', TestConnection::table(self::ORDER_TABLE)),
            [$outTradeNo, $state, $totalFee, time()]
        );
    }

    /** The money lands at the gateway while the app is not looking. */
    public function simulatePayment(string $outTradeNo, ?string $tradeNo = null): void
    {
        TestConnection::exec(
            sprintf('UPDATE %s SET state = "paid", trade_no = ? WHERE out_trade_no = ?', TestConnection::table(self::ORDER_TABLE)),
            [$tradeNo ?? ('gw-trade-' . substr(md5($outTradeNo), 0, 12)), $outTradeNo]
        );
    }

    /** The gateway refuses to create for this order (transport error). */
    public function failCreate(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['fail_create' => 1]);
    }

    /** Create is accepted, but the response never arrives. */
    public function respondTimeout(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['respond_timeout' => 1]);
    }

    /** The payment happens while the response is already on the wire. */
    public function payBeforeResponse(string $outTradeNo, ?string $tradeNo = null): void
    {
        $this->upsertOrder($outTradeNo, [
            'pay_before_response' => 1,
            'trade_no' => (string)$tradeNo,
        ]);
    }

    /** Close requests are refused (e.g. order already paid at the gateway). */
    public function failClose(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['fail_close' => 1]);
    }

    /** Close requests hit an unresponsive transport. */
    public function closeTimeout(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['close_timeout' => 1]);
    }

    /** Query requests hit an unresponsive transport. */
    public function respondQueryTimeout(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['query_timeout' => 1]);
    }

    /** Hold a request of this order on a barrier before returning a response. */
    public function holdOnBarrier(string $outTradeNo, string $barrierKey): void
    {
        ConcurrencyBarrier::open($barrierKey);
        $this->upsertOrder($outTradeNo, ['hold_barrier' => $barrierKey]);
    }

    /**
     * Hold the very ENTRY of create() on a barrier, before the gateway records
     * anything. A settle that runs while the entry is held sees not_exist — the
     * transport truth for a request that has not landed yet.
     */
    public function holdCreateEntry(string $outTradeNo, string $barrierKey): void
    {
        ConcurrencyBarrier::open($barrierKey);
        TestConnection::exec(
            sprintf('REPLACE INTO %s (out_trade_no, create_hold) VALUES (?, ?)', TestConnection::table(self::SCENARIO_TABLE)),
            [$outTradeNo, $barrierKey]
        );
    }

    /** Refund requests fail with a transport error. */
    public function failRefund(string $outRefundNo): void
    {
        TestConnection::exec(
            sprintf('REPLACE INTO %s (out_refund_no, state, fail, created) VALUES (?, "closed", 1, ?)', TestConnection::table(self::REFUND_TABLE)),
            [$outRefundNo, time()]
        );
    }

    /**
     * Every refund attempt for this merchant order number fails at the
     * transport (the gateway can never confirm an outcome).
     */
    public function failRefundForTrade(string $outTradeNo): void
    {
        $this->upsertOrder($outTradeNo, ['fail_refund' => 1]);
    }

    /**
     * How many distinct refund rows the gateway holds for an order: the proof
     * that repeat executions did not pay out twice. The driver may identify the
     * order by merchant order number or by trade number, so both are matched.
     */
    public function refundRowCount(string $identifier): int
    {
        $row = TestConnection::one(
            sprintf('SELECT COUNT(*) AS total FROM %s WHERE out_trade_no = ? OR out_trade_no IN (SELECT trade_no FROM %s WHERE out_trade_no = ?)', TestConnection::table(self::REFUND_TABLE), TestConnection::table(self::ORDER_TABLE)),
            [$identifier, $identifier]
        );

        return (int)($row['total'] ?? 0);
    }

    /** Refund is accepted (processing) and held on a barrier before the response. */
    public function holdRefundResponse(string $outRefundNo, string $outTradeNo, string $refundFee, string $barrierKey): void
    {
        ConcurrencyBarrier::open($barrierKey);
        TestConnection::exec(
            sprintf('REPLACE INTO %s (out_refund_no, out_trade_no, refund_fee, state, hold_barrier, created) VALUES (?, ?, ?, "processing", ?, ?)', TestConnection::table(self::REFUND_TABLE)),
            [$outRefundNo, $outTradeNo, $refundFee, $barrierKey, time()]
        );
    }

    /** A held refund response is finally delivered (e.g. the barrier released). */
    public function completeRefund(string $outRefundNo): void
    {
        TestConnection::exec(
            sprintf('UPDATE %s SET state = "success" WHERE out_refund_no = ?', TestConnection::table(self::REFUND_TABLE)),
            [$outRefundNo]
        );
    }

    /** A refund row that already exists at the gateway (e.g. from a lost response). */
    public function seedRefund(string $outRefundNo, string $outTradeNo, string $fee, string $state = 'success'): void
    {
        TestConnection::exec(
            sprintf('REPLACE INTO %s (out_refund_no, out_trade_no, refund_fee, state, created) VALUES (?, ?, ?, ?, ?)', TestConnection::table(self::REFUND_TABLE)),
            [$outRefundNo, $outTradeNo, $fee, $state, time()]
        );
    }

    // ------------------------------------------------------------------
    // Observation
    // ------------------------------------------------------------------

    public function gatewayOrder(string $outTradeNo): ?array
    {
        return TestConnection::one(
            sprintf('SELECT * FROM %s WHERE out_trade_no = ?', TestConnection::table(self::ORDER_TABLE)),
            [$outTradeNo]
        );
    }

    public function gatewayState(string $outTradeNo): string
    {
        $order = $this->gatewayOrder($outTradeNo);

        return $order === null ? 'not_exist' : (string)$order['state'];
    }

    public function requests(string $kind, ?string $outTradeNo = null): array
    {
        if ($outTradeNo === null) {
            return TestConnection::all(
                sprintf('SELECT * FROM %s WHERE kind = ? ORDER BY id', TestConnection::table(self::REQUEST_TABLE)),
                [$kind]
            );
        }

        return TestConnection::all(
            sprintf('SELECT * FROM %s WHERE kind = ? AND out_trade_no = ? ORDER BY id', TestConnection::table(self::REQUEST_TABLE)),
            [$kind, $outTradeNo]
        );
    }

    public function requestCount(string $kind, ?string $outTradeNo = null): int
    {
        return count($this->requests($kind, $outTradeNo));
    }

    public function refundRequests(string $kind, ?string $refundNo = null): array
    {
        if ($refundNo === null) {
            return TestConnection::all(
                sprintf('SELECT * FROM %s WHERE kind = ? ORDER BY id', TestConnection::table(self::REQUEST_TABLE)),
                [$kind]
            );
        }

        return TestConnection::all(
            sprintf('SELECT * FROM %s WHERE kind = ? AND refund_no = ? ORDER BY id', TestConnection::table(self::REQUEST_TABLE)),
            [$kind, $refundNo]
        );
    }

    // ------------------------------------------------------------------
    // PayInterface — the transport boundary
    // ------------------------------------------------------------------

    public function create(string $orderId, string $totalFee, string $attach, string $body, string $detail, array $options = [])
    {
        $this->holdCreateEntryIfRequested($orderId);
        $this->log('create', $orderId, '', [
            'total_fee' => $totalFee,
            'attach' => $attach,
            'body' => $body,
            'options' => $options,
        ]);
        $order = $this->gatewayOrder($orderId);
        if (!$order) {
            TestConnection::exec(
                sprintf('INSERT INTO %s (out_trade_no, state, total_fee, created) VALUES (?, "open", ?, ?)', TestConnection::table(self::ORDER_TABLE)),
                [$orderId, $totalFee, time()]
            );
            $order = $this->gatewayOrder($orderId);
        }
        if ((int)$order['fail_create'] === 1) {
            throw new \RuntimeException('offline gateway: create transport error');
        }
        if ((int)$order['pay_before_response'] === 1) {
            $this->simulatePayment($orderId);
            throw new \RuntimeException('offline gateway: connection reset before response');
        }
        $this->holdIfRequested($orderId);
        if ((int)$order['respond_timeout'] === 1) {
            throw new \RuntimeException('offline gateway: create response timeout');
        }

        return self::FAKE_JSCONFIG;
    }

    public function queryOrder(string $outTradeNo, array $options = [])
    {
        $this->log('query', $outTradeNo, '', ['options' => $options]);
        $this->holdIfRequested($outTradeNo);
        $order = $this->gatewayOrder($outTradeNo);
        if (!$order) {
            // The real gateways answer ORDERNOTEXIST for a trade they never saw.
            return ['state' => 'not_exist', 'trade_no' => '', 'raw' => null];
        }
        if ((int)$order['query_timeout'] === 1) {
            return ['state' => 'unknown', 'trade_no' => '', 'raw' => null];
        }
        switch ($order['state']) {
            case 'paid':
                return ['state' => 'paid', 'trade_no' => $order['trade_no'], 'raw' => null];
            case 'closed':
                return ['state' => 'closed', 'trade_no' => '', 'raw' => null];
            default:
                return ['state' => 'open', 'trade_no' => '', 'raw' => null];
        }
    }

    public function closeOrder(string $outTradeNo, array $options = []): bool
    {
        $this->log('close', $outTradeNo, '', ['options' => $options]);
        $this->holdIfRequested($outTradeNo);
        $order = $this->gatewayOrder($outTradeNo);
        if (!$order || (int)$order['close_timeout'] === 1) {
            return false;
        }
        if ((int)$order['fail_close'] === 1) {
            return false;
        }
        if ($order['state'] === 'paid') {
            return false;
        }
        if ($order['state'] === 'open') {
            TestConnection::exec(
                sprintf('UPDATE %s SET state = "closed" WHERE out_trade_no = ?', TestConnection::table(self::ORDER_TABLE)),
                [$outTradeNo]
            );
        }

        return true;
    }

    public function refund(string $outTradeNo, array $options = [])
    {
        $refundNo = (string)($options['refund_id'] ?? '');
        $fee = (string)($options['refund_price'] ?? '0');
        $this->log('refund', $outTradeNo, $refundNo, ['refund_price' => $fee, 'options' => $options]);
        if ($refundNo === '') {
            throw new \RuntimeException('offline gateway: refund without a refund number');
        }
        $order = $this->gatewayOrder($outTradeNo);
        if (!$order) {
            // A refund is identified by the merchant order number or by the
            // gateway trade number; accept either, the way the real APIs do.
            $order = TestConnection::one(
                sprintf('SELECT * FROM %s WHERE trade_no = ?', TestConnection::table(self::ORDER_TABLE)),
                [$outTradeNo]
            );
        }
        if (!$order || $order['state'] !== 'paid') {
            throw new \RuntimeException('offline gateway: refund against an unpaid gateway order');
        }
        if ((int)$order['fail_refund'] === 1) {
            throw new \RuntimeException('offline gateway: refund transport error');
        }
        $existing = TestConnection::one(
            sprintf('SELECT * FROM %s WHERE out_refund_no = ?', TestConnection::table(self::REFUND_TABLE)),
            [$refundNo]
        );
        if ($existing) {
            if ((int)$existing['fail'] === 1) {
                throw new \RuntimeException('offline gateway: refund transport error');
            }
            if ($existing['state'] === 'processing') {
                $this->holdIfRequested($outTradeNo, (string)$existing['hold_barrier']);
                throw new \RuntimeException('offline gateway: refund response still pending');
            }

            return true;
        }
        TestConnection::exec(
            sprintf('INSERT INTO %s (out_refund_no, out_trade_no, refund_fee, state, hold_barrier, created) VALUES (?, ?, ?, "success", ?, ?)', TestConnection::table(self::REFUND_TABLE)),
            [$refundNo, $outTradeNo, $fee, (string)($options['hold_barrier'] ?? ''), time()]
        );
        $this->holdIfRequested($outTradeNo, (string)($options['hold_barrier'] ?? ''));

        return true;
    }

    public function queryRefund(string $outTradeNo, string $outRequestNo, array $other = [])
    {
        $this->log('refund_query', $outTradeNo, $outRequestNo, ['other' => $other]);
        $row = TestConnection::one(
            sprintf('SELECT * FROM %s WHERE out_refund_no = ?', TestConnection::table(self::REFUND_TABLE)),
            [$outRequestNo]
        );
        if (!$row) {
            return ['state' => 'not_exist', 'refund_no' => $outRequestNo, 'raw' => null];
        }
        switch ($row['state']) {
            case 'success':
                return ['state' => 'success', 'refund_no' => $outRequestNo, 'raw' => null];
            case 'processing':
                return ['state' => 'processing', 'refund_no' => $outRequestNo, 'raw' => null];
            default:
                return ['state' => 'closed', 'refund_no' => $outRequestNo, 'raw' => null];
        }
    }

    public function setPayType(string $type)
    {
        return $this;
    }

    public function merchantPay(string $openid, string $orderId, string $amount, array $options = [])
    {
        throw new \RuntimeException('offline gateway: merchant pay is not part of the retained shop');
    }

    public function handleNotify()
    {
        throw new \RuntimeException('offline gateway: notifications are delivered by the test over HTTP');
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    private function holdCreateEntryIfRequested(string $outTradeNo): void
    {
        $scenario = TestConnection::one(
            sprintf('SELECT create_hold FROM %s WHERE out_trade_no = ?', TestConnection::table(self::SCENARIO_TABLE)),
            [$outTradeNo]
        );
        if ($scenario && (string)$scenario['create_hold'] !== '') {
            ConcurrencyBarrier::await((string)$scenario['create_hold'], 30.0);
        }
    }

    private function holdIfRequested(string $outTradeNo, string $barrierOverride = ''): void
    {
        $barrier = $barrierOverride;
        if ($barrier === '') {
            $order = $this->gatewayOrder($outTradeNo);
            $barrier = $order === null ? '' : (string)$order['hold_barrier'];
        }
        if ($barrier !== '') {
            ConcurrencyBarrier::await($barrier, 20.0);
        }
    }

    /**
     * @param array<string, int|string> $data
     */
    private function upsertOrder(string $outTradeNo, array $data): void
    {
        if (!$this->gatewayOrder($outTradeNo)) {
            TestConnection::exec(
                sprintf('INSERT INTO %s (out_trade_no, state, created) VALUES (?, "open", ?)', TestConnection::table(self::ORDER_TABLE)),
                [$outTradeNo, time()]
            );
        }
        $sets = [];
        $params = [];
        foreach ($data as $column => $value) {
            $sets[] = sprintf('%s = ?', $column);
            $params[] = $value;
        }
        $params[] = $outTradeNo;
        TestConnection::exec(
            sprintf('UPDATE %s SET %s WHERE out_trade_no = ?', TestConnection::table(self::ORDER_TABLE), implode(', ', $sets)),
            $params
        );
    }

    private function log(string $kind, string $outTradeNo, string $refundNo, array $payload): void
    {
        TestConnection::exec(
            sprintf('INSERT INTO %s (kind, out_trade_no, refund_no, payload, created) VALUES (?, ?, ?, ?, ?)', TestConnection::table(self::REQUEST_TABLE)),
            [$kind, $outTradeNo, $refundNo, json_encode($payload, JSON_UNESCAPED_UNICODE), time()]
        );
    }
}
