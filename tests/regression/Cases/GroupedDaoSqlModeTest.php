<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\OtherOrderDao;
use app\dao\order\StoreCartDao;
use app\dao\order\StoreOrderDao;
use app\dao\order\StoreOrderRefundDao;
use app\dao\product\product\StoreProductLogDao;
use app\dao\product\product\StoreProductReplyStoreProductDao;
use app\dao\shipping\ShippingTemplatesFreeCityDao;
use app\dao\shipping\ShippingTemplatesNoDeliveryCityDao;
use app\dao\shipping\ShippingTemplatesRegionCityDao;
use app\dao\user\UserBillDao;
use app\dao\user\UserExtractDao;
use app\dao\user\UserMoneyDao;
use app\dao\user\UserRechargeDao;
use app\dao\user\UserSignDao;
use app\dao\user\UserStoreOrderDao;
use app\dao\user\UserUserBillDao;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class GroupedDaoSqlModeTest extends RegressionTestCase
{
    public function testCartRowsWithSameSkuAreSummed(): void
    {
        $originalMode = Db::query('SELECT @@SESSION.sql_mode AS sql_mode')[0]['sql_mode'];
        Db::startTrans();

        try {
            Db::execute("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
            $unique = 'regression-cart';
            Db::name('store_cart')->insertAll([
                ['uid' => 1, 'product_id' => 1, 'product_attr_unique' => $unique, 'cart_num' => 2, 'add_time' => 1],
                ['uid' => 1, 'product_id' => 1, 'product_attr_unique' => $unique, 'cart_num' => 3, 'add_time' => 2],
            ]);

            $rows = (new StoreCartDao())->productIdByCartNum([1], 1);
            self::assertArrayHasKey($unique, $rows);
            self::assertSame(5, (int) $rows[$unique]['cart_num']);
            self::assertSame(1, (int) $rows[$unique]['product_id']);
        } finally {
            Db::rollback();
            Db::execute('SET SESSION sql_mode = ?', [$originalMode]);
        }
    }

    public function testGroupedDaoQueriesSupportOnlyFullGroupBy(): void
    {
        $originalMode = Db::query('SELECT @@SESSION.sql_mode AS sql_mode')[0]['sql_mode'];

        try {
            Db::execute("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
            $timeKey = [
                'timeKey' => [
                    'start_time' => '2026-09-01 00:00:00',
                    'end_time' => '2026-09-30 23:59:59',
                    'days' => 30,
                ],
            ];

            $billDao = new UserBillDao();
            self::assertIsIterable($billDao->getType([]));
            self::assertIsArray($billDao->getUserBillListByGroup(
                ['uid' => -1],
                'FROM_UNIXTIME(add_time,"%Y-%m") as time,GROUP_CONCAT(id SEPARATOR ",") ids',
                'time',
                1,
                20
            ));
            self::assertIsArray($billDao->getGroupField($timeKey, 'number', 'add_time'));
            self::assertIsArray((new UserMoneyDao())->getGroupField($timeKey, 'number', 'add_time'));
            self::assertIsArray((new UserExtractDao())->getGroupField($timeKey, 'extract_price', 'add_time'));
            self::assertIsArray((new UserRechargeDao())->getGroupField($timeKey, 'price', 'pay_time'));

            $otherOrderDao = new OtherOrderDao();
            self::assertIsArray($otherOrderDao->getPayUserCount(time(), 'regression-none'));
            self::assertIsArray($otherOrderDao->getGroupField($timeKey, 'pay_price', 'pay_time'));
            self::assertIsArray((new StoreOrderRefundDao())->getDayGroupMoney($timeKey, 'refund_price', 'add_time'));

            $orderDao = new StoreOrderDao();
            self::assertIsArray($orderDao->nowOrderList('2026-09-01', '2026-09-30', 'month'));
            self::assertIsArray($orderDao->getOrderDataPriceCount([], [
                'SUM(pay_price) as price',
                'COUNT(id) as count',
                "FROM_UNIXTIME(MIN(add_time), '%m-%d') as time",
            ], 1, 20));
            self::assertIsArray($orderDao->chartTimePrice(strtotime('2026-09-01'), strtotime('2026-10-01')));
            self::assertIsArray($orderDao->chartTimeNumber(strtotime('2026-09-01'), strtotime('2026-10-01')));
            self::assertIsArray($orderDao->getDayGroupMoney($timeKey, 'pay_price', 'pay_time'));
            self::assertIsArray($orderDao->getOrderGroupCount($timeKey));
            self::assertIsArray($orderDao->getPayOrderGroupPeople($timeKey));
            self::assertIsArray($orderDao->seckillPeople(-1, 'regression-none', 1, 20));

            self::assertIsArray((new StoreCartDao())->productIdByCartNum([-1], -1));
            self::assertIsArray((new UserSignDao())->getListGroup(
                ['uid' => -1],
                'FROM_UNIXTIME(add_time,"%Y-%m") as time,GROUP_CONCAT(id SEPARATOR ",") ids',
                1,
                20,
                'time'
            ));
            self::assertIsArray((new UserStoreOrderDao())->getUserSpreadCountList(
                [['u.uid', '=', -1]],
                'u.uid,u.nickname,p.orderCount,p.numberCount',
                'u.add_time desc',
                1,
                20
            ));
            self::assertIsArray((new UserUserBillDao())->getList([['u.uid', '=', -1]], '', '', 1, 20));

            $replyWhere = [
                'data' => '',
                'is_reply' => '',
                'product_id' => 0,
                'store_name' => '',
                'account' => '',
                'status' => '',
                'key' => '',
                'order' => 'desc',
            ];
            self::assertIsArray((new StoreProductReplyStoreProductDao())->getProductReplyList($replyWhere, 1, 20));
            self::assertIsArray((new StoreProductLogDao())->getList(
                ['uid' => -1, 'type' => 'visit'],
                'MAX(id) as id,product_id,MAX(add_time) as add_time',
                1,
                20,
                'product_id'
            ));

            foreach ([
                new ShippingTemplatesFreeCityDao(),
                new ShippingTemplatesRegionCityDao(),
                new ShippingTemplatesNoDeliveryCityDao(),
            ] as $shippingDao) {
                self::assertIsArray($shippingDao->getUniqidList(['uniqid' => 'regression-none']));
                self::assertIsArray($shippingDao->getUniqidList(['uniqid' => 'regression-none', 'province_id' => -1], false));
            }
        } finally {
            Db::execute('SET SESSION sql_mode = ?', [$originalMode]);
        }
    }
}
