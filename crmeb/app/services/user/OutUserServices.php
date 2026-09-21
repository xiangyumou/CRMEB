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

use app\dao\user\UserDao;
use app\services\BaseServices;
use crmeb\exceptions\ApiException;

/**
 *
 * Class OutUserServices
 * @package app\services\user
 */
class OutUserServices extends BaseServices
{

    /**
     * UserServices constructor.
     * @param UserDao $dao
     */
    public function __construct(UserDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 用户列表
     * @param array $where
     * @return array
     */
    public function getUserList(array $where): array
    {
        /** @var UserWechatuserServices $userWechatUser */
        $userWechatUser = app()->make(UserWechatuserServices::class);
        $fields = 'u.uid, u.real_name, u.mark, u.nickname, u.avatar, u.phone, u.user_type, u.status, u.pay_count, u.add_time';
        [$list, $count] = $userWechatUser->getWhereUserList($where, $fields);
        if ($list) {
            foreach ($list as &$item) {
                //用户类型
                if ($item['user_type'] == 'routine') {
                    $item['user_type'] = '小程序';
                } else if ($item['user_type'] == 'wechat') {
                    $item['user_type'] = '公众号';
                } else if ($item['user_type'] == 'h5') {
                    $item['user_type'] = 'H5';
                } else if ($item['user_type'] == 'pc') {
                    $item['user_type'] = 'PC';
                } else $item['user_type'] = '其他';
            }
        }
        return compact('list', 'count');
    }

    /**
     * 获取用户详情
     * @param $uid
     * @return mixed
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/06/20
     */
    public function userInfo($uid)
    {
        $userType = ['h5' => 'H5', 'wechat' => '公众号', 'routine' => '小程序', 'pc' => 'PC'];
        $fields = ['uid', 'real_name', 'mark', 'nickname', 'avatar', 'phone', 'user_type', 'status', 'pay_count', 'add_time'];
        $data = app()->make(UserServices::class)->get($uid, $fields);
        $data['user_type'] = $userType[$data['user_type']] ?? '其他';
        $data['status'] = $data['status'] ? '正常' : '禁用';
        $data['add_time'] = date('Y-m-d H:i:s', $data['add_time']);
        return $data;
    }

    /**
     * 添加/修改用户
     * @param int $uid
     * @param array $data
     * @return int
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function saveUser(int $uid, array $data): int
    {
        if (empty($data['real_name'])) {
            throw new ApiException('请输入真实姓名');
        }
        if (empty($data['phone'])) {
            throw new ApiException('请填写手机号');
        }

        if (!check_phone($data['phone'])) {
            throw new ApiException('手机号格式错误');
        }
        if ($uid < 1 && $this->count(['phone' => $data['phone'], 'is_del' => 0])) {
            throw new ApiException('手机号已经存在');
        }

        if ($data['pwd']) {
            $data['pwd'] = \app\services\login\UserPassword::hash((string)$data['pwd']);
        } else {
            if ($uid < 1) {
                $data['pwd'] = \app\services\login\UserPassword::hash('123456');
            } else {
                unset($data['pwd']);
            }
        }
        return $this->transaction(function () use ($uid, $data) {
            if ($uid) {
                $userInfo = $this->dao->update($uid, $data);
            } else {
                if (trim($data['real_name']) != '') {
                    $data['nickname'] = $data['real_name'];
                } else {
                    $data['nickname'] = substr_replace($data['phone'], '****', 3, 4);
                }

                $data['avatar'] = sys_config('h5_avatar');
                $data['user_type'] = 'h5';
                $data['add_time'] = time();
                $userInfo = $this->dao->save($data);
                $uid = (int)$userInfo->uid;
            }
            if (!$userInfo) {
                throw new ApiException('保存失败');
            }
            return (int)$uid;
        });
    }
}
