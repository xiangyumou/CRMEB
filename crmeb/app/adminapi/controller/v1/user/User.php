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
namespace app\adminapi\controller\v1\user;

use app\services\activity\coupon\StoreCouponIssueServices;
use app\services\system\config\SystemConfigServices;
use app\services\user\UserServices;
use app\adminapi\controller\AuthController;
use crmeb\services\CacheService;
use think\exception\ValidateException;
use think\facade\App;

class User extends AuthController
{
    /**
     * @var UserServices
     */
    protected $services;

    /**
     * user constructor.
     * @param App $app
     * @param UserServices $services
     */
    public function __construct(App $app, UserServices $services)
    {
        parent::__construct($app);
        $this->services = $services;
    }

    /**
     * 用户列表
     * @return mixed
     */
    public function index()
    {
        \app\services\CoreStore::assertAdminUser($this->request->get());
        $where = $this->request->getMore([
            ['page', 1],
            ['limit', 20],
            ['nickname', ''],
            ['status', ''],
            ['pay_count', ''],
            ['order', ''],
            ['data', ''],
            ['user_type', ''],
            ['country', ''],
            ['province', ''],
            ['city', ''],
            ['user_time_type', ''],
            ['user_time', ''],
            ['sex', ''],
            [['group_id', 'd'], 0],
            ['label_id', ''],
            ['field_key', ''],
            ['before_pay_time', ''],
            ['pay_count_num', []],
            ['pay_count_money', []],
        ]);
        $where['label_id'] = toIntArray($where['label_id']);
        return app('json')->success($this->services->index($where));
    }

    /**
     * 添加用户表单
     * @return mixed
     * @throws \FormBuilder\Exception\FormBuilderException
     */
    public function create()
    {
        return app('json')->success($this->services->saveForm());
    }

    /**
     * 添加编辑用户信息时候的信息
     * @param $uid
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function userSaveInfo($uid = 0)
    {
        $data = $this->services->getUserSaveInfo($uid);
        return app('json')->success($data);
    }

    /**
     * 保存新建用户
     * @return mixed
     * @throws \think\Exception
     */
    public function save()
    {
        \app\services\CoreStore::assertAdminUser($this->request->post());
        $data = $this->request->postMore([
            ['real_name', ''],
            ['phone', 0],
            ['birthday', ''],
            ['card_id', ''],
            ['addres', ''],
            ['mark', ''],
            ['pwd', ''],
            ['true_pwd', ''],
            ['group_id', 0],
            ['label_id', []],
            ['status', 0]
        ]);
        if (!$data['real_name']) {
            return app('json')->fail('请填写姓名和电话');
        }
        if (!$data['phone']) {
            return app('json')->fail('请填写姓名和电话');
        }
        if (!check_phone($data['phone'])) {
            return app('json')->fail('手机号格式错误');
        }
        if ($this->services->count(['phone' => $data['phone'], 'is_del' => 0])) {
            return app('json')->fail('手机号已经存在');
        }
        $data['nickname'] = $data['real_name'];
        if ($data['card_id']) {
            if (!check_card($data['card_id'])) return app('json')->fail('请输入正确的身份证');
        }
        if (!$data['pwd']) {
            return app('json')->fail('请输入密码');
        }
        if (!$data['true_pwd']) {
            return app('json')->fail('请输入确认密码');
        }
        if ($data['pwd'] != $data['true_pwd']) {
            return app('json')->fail('两次输入的密码不一致');
        }
        if (strlen($data['pwd']) < 6 || strlen($data['pwd']) > 32) {
            return app('json')->fail('账号密码必须是在6到32位之间');
        }
        $data['pwd'] = md5($data['pwd']);
        unset($data['true_pwd']);
        $data['avatar'] = sys_config('h5_avatar');
        $data['adminId'] = $this->adminId;
        $data['user_type'] = 'h5';
        $label = $data['label_id'];
        unset($data['label_id']);
        foreach ($label as $k => $v) {
            if (!$v) {
                unset($label[$k]);
            }
        }
        $data['birthday'] = empty($data['birthday']) ? 0 : strtotime($data['birthday']);
        $data['add_time'] = time();
        $this->services->transaction(function () use ($data, $label) {
            $res = true;
            $userInfo = $this->services->save($data);
            $this->services->rewardNewUser((int)$userInfo->uid);
            app()->make(StoreCouponIssueServices::class)->userFirstSubGiveCoupon((int)$userInfo->uid);
            if ($label) {
                $res = $this->services->saveSetLabel([$userInfo->uid], $label);
            }
            if (!$res) {
                return app('json')->fail('保存失败');
            }
        });
        return app('json')->success('添加成功');
    }

    /**
     * 获取用户账户详情
     * @param $id
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function read($id)
    {
        if (is_string($id)) {
            $id = (int)$id;
        }
        return app('json')->success($this->services->read($id));
    }

    /**
     * 设置会员分组
     * @return mixed
     */
    public function set_group()
    {
        list($uids) = $this->request->postMore([
            ['uids', []],
        ], true);
        if (!$uids) return app('json')->fail('参数错误');
        return app('json')->success($this->services->setGroup($uids));
    }

    /**
     * 保存会员分组
     * @return mixed
     */
    public function save_set_group()
    {
        list($group_id, $uids) = $this->request->postMore([
            ['group_id', 0],
            ['uids', ''],
        ], true);
        if (!$uids) return app('json')->fail('参数错误');
        if (!$group_id) return app('json')->fail('请选择分组');
        $uids = explode(',', $uids);
        return app('json')->success($this->services->saveSetGroup($uids, (int)$group_id) ? '设置成功' : '设置失败');
    }

    /**
     * 设置用户标签
     * @return mixed
     */
    public function set_label()
    {
        list($uids) = $this->request->postMore([
            ['uids', []],
        ], true);
        $uid = implode(',', $uids);
        if (!$uid) return app('json')->fail('参数错误');
        return app('json')->success($this->services->setLabel($uids));
    }

    /**
     * 保存用户标签
     * @return mixed
     */
    public function save_set_label()
    {
        list($labels, $uids, $label_type) = $this->request->postMore([
            ['label_id', []],
            ['uids', ''],
            ['label_type', 0],
        ], true);
        if (!$uids) return app('json')->fail('参数错误');
        if (!$labels) return app('json')->fail('请选择标签');
        $uids = explode(',', $uids);
        return app('json')->success($this->services->saveSetLabel($uids, $labels, $label_type) ? '设置成功' : '设置失败');
    }

    /**
     * 编辑会员信息
     * @param $id
     * @return mixed
     * @throws \FormBuilder\Exception\FormBuilderException
     */
    public function edit($id)
    {
        if (!$id) return app('json')->fail('参数错误');
        return app('json')->success($this->services->edit($id));
    }

    /**
     * 修改用户
     * @param $id
     * @return mixed
     * @throws \think\Exception
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function update($id)
    {
        \app\services\CoreStore::assertAdminUser($this->request->post());
        $data = $this->request->postMore([
            ['real_name', ''],
            ['card_id', ''],
            ['birthday', ''],
            ['mark', ''],
            ['status', 0],
            ['phone', 0],
            ['addres', ''],
            ['label_id', []],
            ['group_id', 0],
            ['pwd', ''],
            ['true_pwd']
        ]);
        if (!$id) return app('json')->fail('参数错误');
        if (!$data['real_name']) {
            return app('json')->fail('请填写姓名和电话');
        }
        if (!$data['phone']) {
            return app('json')->fail('请填写姓名和电话');
        }
        if ($data['phone']) {
            if (!preg_match("/^1[3456789]\d{9}$/", $data['phone'])) return app('json')->fail('手机号格式错误');
        }
        if ($this->services->count(['phone' => $data['phone'], 'is_del' => 0, 'not_uid' => $id])) {
            return app('json')->fail('手机号已经存在');
        }
        if ($data['card_id']) {
            if (!check_card($data['card_id'])) return app('json')->fail('请输入正确的身份证');
        }
        if ($data['pwd']) {
            if (!$data['true_pwd']) {
                return app('json')->fail('请输入确认密码');
            }
            if ($data['pwd'] != $data['true_pwd']) {
                return app('json')->fail('两次输入的密码不一致');
            }
            if (strlen($data['pwd']) < 6 || strlen($data['pwd']) > 32) {
                return app('json')->fail('账号密码必须是在6到32位之间');
            }
            $data['pwd'] = md5($data['pwd']);
        } else {
            unset($data['pwd']);
        }
        unset($data['true_pwd']);
        return app('json')->success($this->services->updateInfo($id, $data) ? '修改成功' : '修改失败');
    }

    /**
     * 获取单个用户信息
     * @param $id
     * @return mixed
     */
    public function oneUserInfo($id)
    {
        $data = $this->request->getMore([
            ['type', ''],
        ]);
        $id = (int)$id;
        if ($data['type'] == '') return app('json')->fail('参数错误');
        if (!in_array($data['type'], ['order', 'coupon'], true)) {
            throw new \crmeb\exceptions\ApiException('当前商城不支持该业务');
        }
        return app('json')->success($this->services->oneUserInfo($id, $data['type']));
    }

    /**
     * 同步微信粉丝用户
     * @return mixed
     */
    public function syncWechatUsers()
    {
        $this->services->syncWechatUsers();
        return app('json')->success('加入消息队列成功');
    }

    /**
     * 新人礼
     * @return \think\Response
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/9/21
     */
    public function getNewGift()
    {
        $data = [
            'reward_coupon' => sys_config('reward_coupon') == '' ? [] : sys_config('reward_coupon')
        ];
        return app('json')->success($data);
    }

    /**
     * 保存新人礼
     * @return \think\Response
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/9/21
     */
    public function saveNewGift()
    {
        \app\services\CoreStore::assertGift($this->request->post());
        $data = $this->request->postMore([
            ['reward_coupon', '']
        ]);
        $configServices = app()->make(SystemConfigServices::class);
        foreach ($data as $k => $v) {
            $configServices->update($k, ['value' => json_encode($v)], 'menu_name');
        }
        CacheService::clear();
        return app('json')->success('保存成功');
    }
}
