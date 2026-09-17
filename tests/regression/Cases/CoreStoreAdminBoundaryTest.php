<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use app\services\CoreStore;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\RegressionTestCase;

final class CoreStoreAdminBoundaryTest extends RegressionTestCase
{
    /** @dataProvider retiredUserInput */
    public function testRetiredUserParametersAreRejectedBeforeWrites(array $input): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('当前商城不支持该业务');
        CoreStore::assertAdminUser($input);
    }

    public function retiredUserInput(): array
    {
        return [[['level' => 3]], [['agent_level' => 2]], [['money' => -1]], [['balance' => ['', '50']]], [['is_promoter' => 1]], [['integration' => 5]]];
    }

    public function testRetainedUserFiltersAndEmptyLegacyValuesWork(): void
    {
        CoreStore::assertAdminUser(['group_id' => 4, 'label_id' => '2,3', 'level' => 0, 'balance' => ['', '']]);
        self::assertTrue(true);
    }

    /** @dataProvider retiredHttpRoutes */
    public function testRetiredAdminRoutesAreNotHandled(string $method, string $path): void
    {
        $curl = curl_init(rtrim(getenv('REGRESSION_HTTP_BASE_URL'), '/') . $path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        self::assertSame(404, $status, (string)$body);
        self::assertStringNotContainsString('<!DOCTYPE html>', (string)$body);
    }

    public function retiredHttpRoutes(): array
    {
        return [['GET', '/adminapi/user/user_level/vip_list'], ['GET', '/adminapi/agent/level'], ['GET', '/adminapi/user/give_level/42'], ['PUT', '/adminapi/user/save_give_level/42'], ['DELETE', '/adminapi/user/del_level/42'], ['GET', '/adminapi/user/give_level_time/42'], ['PUT', '/adminapi/user/update_other/42'], ['PUT', '/adminapi/agent/stair/delete_spread/42']];
    }

    /** @dataProvider retainedHttpRoutes */
    public function testRetainedAdminRoutesStillMatch(string $path): void
    {
        $curl = curl_init(rtrim(getenv('REGRESSION_HTTP_BASE_URL'), '/') . $path);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        self::assertNotSame(404, $status, (string)$body);
    }

    public function retainedHttpRoutes(): array
    {
        return [['/adminapi/user/user'], ['/adminapi/user/user_group/list'], ['/adminapi/user/user_label']];
    }
}
