<?php
// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2026 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------
declare (strict_types=1);

namespace app\services\user;

use app\services\BaseServices;
use app\dao\user\UserBillDao;
use crmeb\exceptions\AdminException;
use crmeb\services\CacheService;

/**
 *
 * Class UserBillServices
 * @package app\services\user
 * @method count(array $where) 求条数
 * @method getList(array $where, string $field, int $page, int $limit, $typeWhere = [], $order = 'id desc') 获取某个条件总数
 */
class UserBillServices extends BaseServices
{

    public function __construct(UserBillDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 记录分享次数
     * @param int $uid 用户uid
     * @param int $cd 冷却时间
     * @return Boolean
     * */
    public function setUserShare(int $uid, $cd = 300)
    {
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $user = $userServices->getUserInfo($uid);
        if (!$user) {
            throw new AdminException('用户信息不存在');
        }
        $cachename = 'Share_' . $uid;
        if (CacheService::get($cachename)) {
            return false;
        }
        $data = ['title' => '用户分享记录', 'uid' => $uid, 'category' => 'share', 'type' => 'share', 'number' => 0, 'link_id' => 0, 'balance' => 0, 'mark' => date('Y-m-d H:i:s', time()) . ':用户分享'];
        if (!$this->dao->save($data)) {
            throw new AdminException('记录分享记录失败');
        }
        CacheService::set($cachename, 1, $cd);
        return true;
    }
}
