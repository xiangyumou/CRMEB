<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\user\UserWechatUserDao;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class UserListSqlModeTest extends RegressionTestCase
{
    public function testUserListUsesLatestActiveWechatRecordUnderOnlyFullGroupBy(): void
    {
        $originalMode = Db::query('SELECT @@SESSION.sql_mode AS sql_mode')[0]['sql_mode'];
        Db::startTrans();

        try {
            Db::execute("SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'");
            $this->insertWechatUser('regression-old', '中国', '广东', '深圳', 1, 0);
            $this->insertWechatUser('regression-current', 'Malaysia', 'Selangor', 'Kuala Lumpur', 2, 0);
            $this->insertWechatUser('regression-deleted', 'Singapore', 'Central', 'Singapore', 1, 1);

            $dao = new UserWechatUserDao();
            $fields = 'u.*,w.country,w.province,w.city,w.sex,w.unionid,w.openid,w.user_type as w_user_type,w.groupid,w.tagid_list,w.subscribe,w.subscribe_time';
            $where = ['ids' => [1]];
            $list = $dao->getListByModel($where, $fields, '', 1, 20);

            self::assertCount(1, $list);
            self::assertSame('Malaysia', $list[0]['country']);
            self::assertSame('Selangor', $list[0]['province']);
            self::assertSame('Kuala Lumpur', $list[0]['city']);
            self::assertSame(2, (int)$list[0]['sex']);
            self::assertSame(1, $dao->getCountByWhere($where));
            self::assertCount(0, $dao->getListByModel($where + ['country' => 'domestic'], $fields, '', 1, 20));
            self::assertCount(1, $dao->getListByModel($where + ['country' => 'abroad'], $fields, '', 1, 20));
        } finally {
            Db::rollback();
            Db::execute('SET SESSION sql_mode = ?', [$originalMode]);
        }
    }

    private function insertWechatUser(string $openid, string $country, string $province, string $city, int $sex, int $isDeleted): void
    {
        Db::name('wechat_user')->insert([
            'uid' => 1,
            'openid' => $openid,
            'country' => $country,
            'province' => $province,
            'city' => $city,
            'sex' => $sex,
            'is_del' => $isDeleted,
        ]);
    }
}
