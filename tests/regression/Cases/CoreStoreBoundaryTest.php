<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\services\CoreStore;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\RegressionTestCase;

final class CoreStoreBoundaryTest extends RegressionTestCase
{
    /** @dataProvider retiredPayments */
    public function testRetiredPaymentsAreRejected(string $type): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('当前商城仅支持微信支付');
        CoreStore::assertPayment($type);
    }
    public function retiredPayments(): array { return [['yue'],['alipay'],['offline'],['allinpay'],['']]; }
    /** @dataProvider retiredOrders */
    public function testRetiredOrderParametersAreRejected(array $input): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('当前商城不支持该业务');
        CoreStore::assertOrder($input);
    }
    public function retiredOrders(): array { return [[['bargainId'=>1]],[['seckill_id'=>1]],[['useIntegral'=>true]],[['shipping_type'=>2]],[['shippingType'=>3]],[['storeId'=>1]]]; }
    public function testCombinationAndAdvanceRemainValid(): void
    {
        CoreStore::assertOrder(['combinationId'=>1,'pinkId'=>2,'payType'=>'weixin','shipping_type'=>1]);
        CoreStore::assertOrder(['advanceId'=>3,'payType'=>'weixin']);
        self::assertNotContains('newVip', CoreStore::REMOVED_COMPONENTS);
        self::assertNotContains('combination', CoreStore::REMOVED_COMPONENTS);
        self::assertNotContains('presale', CoreStore::REMOVED_COMPONENTS);
    }
    /** @dataProvider invalidRewards */
    public function testGiftRejectsMoneyAndPoints(array $input): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('新人礼包仅支持优惠券奖励');
        CoreStore::assertGift($input);
    }
    public function invalidRewards(): array { return [[['reward_money'=>1]],[['reward_integral'=>1]],[['reward_money'=>-1]],[['reward_integral'=>'invalid']]]; }
    /** @dataProvider removedEndpoints */
    public function testRemovedRoutesReturnHttp404(string $path): void
    {
        $curl = curl_init(rtrim(getenv('REGRESSION_HTTP_BASE_URL'), '/') . $path);
        curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10]);
        $body = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_HTTP_CODE); curl_close($curl);
        self::assertSame(404,$status,(string)$body);
        self::assertStringNotContainsString('<!DOCTYPE html>', (string)$body);
    }
    public function removedEndpoints(): array { return [['/api/seckill/index'],['/api/bargain/list'],['/api/store_integral/index'],['/api/recharge/index'],['/api/pay/notify/alipay'],['/adminapi/upgrade'],['/kefuapi/anything']]; }

    /** @dataProvider retiredWriteEndpoints */
    public function testRetiredWriteEndpointsAreNotHandled(string $path): void
    {
        $curl = curl_init(rtrim(getenv('REGRESSION_HTTP_BASE_URL'), '/') . $path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CUSTOMREQUEST => 'POST']);
        $body = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
        self::assertSame(404, $status, (string)$body);
        self::assertStringNotContainsString('<!DOCTYPE html>', (string)$body);
    }

    /** Mobile-admin balance/point/level writes and outright aliases must not resolve. */
    public function retiredWriteEndpoints(): array
    {
        return [
            ['/api/admin/manage/user/update/1'],
            ['/api/outapi/user/give_balance/1'],
            ['/api/outapi/user/give_point/1'],
            ['/api/outapi/user/change_balance/1'],
            ['/api/outapi/user/change_point/1'],
        ];
    }

    /** @dataProvider retiredReadEndpoints */
    public function testRetiredReadEndpointsReturnHttp404(string $path): void
    {
        $curl = curl_init(rtrim(getenv('REGRESSION_HTTP_BASE_URL'), '/') . $path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_HTTP_CODE); curl_close($curl);
        self::assertSame(404, $status, (string)$body);
        self::assertStringNotContainsString('<!DOCTYPE html>', (string)$body);
    }

    public function retiredReadEndpoints(): array
    {
        return [
            ['/api/outapi/user_level/list'],
            ['/api/rank'],
            ['/api/user/activity'],
            ['/api/transfer/info'],
            ['/api/v2/diy/get_store_status'],
            ['/adminapi/diy/get_store_status'],
            ['/adminapi/export/member_card/1'],
        ];
    }
}
