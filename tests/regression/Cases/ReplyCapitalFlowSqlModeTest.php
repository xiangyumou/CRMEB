<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\system\statistics\CapitalFlowDao;
use app\dao\wechat\WechatReplyKeyDao;
use app\services\wechat\WechatReplyServices;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class ReplyCapitalFlowSqlModeTest extends RegressionTestCase
{
    private const STRICT_MODE = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

    public function testKeywordReplyWithMultipleKeysReturnsOneReply(): void
    {
        $originalMode = $this->enableStrictMode();
        $replyId = 0;

        try {
            $replyId = (int) Db::name('wechat_reply')->insertGetId([
                'type' => 'text',
                'data' => json_encode(['content' => 'regression'], JSON_UNESCAPED_UNICODE),
                'status' => 1,
                'hide' => 0,
            ]);
            $prefix = 'regression-key-' . $replyId;
            Db::name('wechat_key')->insertAll([
                ['reply_id' => $replyId, 'keys' => $prefix . '-a', 'key_type' => 0],
                ['reply_id' => $replyId, 'keys' => $prefix . '-b', 'key_type' => 0],
            ]);

            $where = ['key' => $prefix, 'key_type' => 0];
            $dao = new WechatReplyKeyDao();
            $list = $dao->getReplyKeyList($where, 1, 20);
            self::assertCount(1, $list);
            self::assertSame($replyId, (int) $list[0]['id']);
            self::assertSame(1, $dao->count($where));

            $result = app()->make(WechatReplyServices::class)->getKeyAll($where);
            self::assertSame(1, (int) $result['count']);
            $keys = explode(',', $result['list'][0]['key']);
            sort($keys);
            self::assertSame([$prefix . '-a', $prefix . '-b'], $keys);
        } finally {
            if ($replyId) {
                Db::name('wechat_key')->where('reply_id', $replyId)->delete();
                Db::name('wechat_reply')->where('id', $replyId)->delete();
            }
            $this->restoreSqlMode($originalMode);
        }
    }

    public function testCapitalFlowGroupsAndCountsEachPeriod(): void
    {
        $originalMode = $this->enableStrictMode();
        Db::startTrans();

        try {
            $token = 'regression-flow-' . uniqid('', true);
            $firstId = (int) Db::name('capital_flow')->insertGetId($this->capitalFlowRow($token, '8.50', strtotime('2026-09-14 10:00:00')));
            $lastId = (int) Db::name('capital_flow')->insertGetId($this->capitalFlowRow($token, '-2.25', strtotime('2026-09-14 11:00:00')));
            $dao = new CapitalFlowDao();

            foreach (['day', 'week', 'month'] as $type) {
                $result = $dao->getRecordList(['type' => $type, 'keywords' => $token], 1, 20);
                self::assertSame(1, (int) $result['count']);
                self::assertCount(1, $result['list']);
                self::assertSame('8.50', $result['list'][0]['income_price']);
                self::assertSame('-2.25', $result['list'][0]['exp_price']);
                self::assertSame(strtotime('2026-09-14 11:00:00'), (int) $result['list'][0]['add_time']);
                self::assertIsArray($result['list'][0]['ids']);
            }
        } finally {
            Db::rollback();
            $this->restoreSqlMode($originalMode);
        }
    }

    private function enableStrictMode(): string
    {
        $originalMode = Db::query('SELECT @@SESSION.sql_mode AS sql_mode')[0]['sql_mode'];
        Db::execute('SET SESSION sql_mode = ?', [self::STRICT_MODE]);
        return $originalMode;
    }

    private function restoreSqlMode(string $mode): void
    {
        Db::execute('SET SESSION sql_mode = ?', [$mode]);
    }


    private function capitalFlowRow(string $token, string $price, int $addTime): array
    {
        return [
            'flow_id' => md5($token . $price),
            'order_id' => $token,
            'uid' => 0,
            'nickname' => '',
            'phone' => '',
            'price' => $price,
            'trading_type' => 1,
            'pay_type' => '',
            'mark' => '',
            'add_time' => $addTime,
        ];
    }
}
