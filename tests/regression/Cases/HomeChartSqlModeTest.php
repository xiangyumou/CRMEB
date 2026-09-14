<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderDao;
use app\dao\user\UserDao;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class HomeChartSqlModeTest extends RegressionTestCase
{
    public function testHomeChartsSupportOnlyFullGroupBy(): void
    {
        $originalMode = Db::query('SELECT @@SESSION.sql_mode AS sql_mode')[0]['sql_mode'];

        try {
            Db::execute("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");

            $start = date('Y-m-d', strtotime('-30 day'));
            $end = date('Y-m-d 23:59:59');

            self::assertIsArray((new StoreOrderDao())->orderAddTimeList($start, $end, '30'));
            self::assertIsArray((new UserDao())->userList($start, date('Y-m-d', strtotime('+1 day'))));
        } finally {
            Db::execute('SET SESSION sql_mode = ?', [$originalMode]);
        }
    }
}
