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

namespace app\services\user;

use app\jobs\UserJob;
use app\services\activity\combination\StoreCombinationServices;
use app\services\BaseServices;
use app\dao\user\UserDao;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\diy\DiyServices;
use app\services\order\StoreOrderCreateServices;
use app\services\order\StoreOrderServices;
use app\services\order\StoreOrderTakeServices;
use app\services\other\QrcodeServices;
use app\services\product\product\StoreProductLogServices;
use app\services\product\product\StoreProductRelationServices;
use app\services\message\MessageSystemServices;
use app\services\wechat\WechatUserServices;
use crmeb\exceptions\AdminException;
use crmeb\exceptions\ApiException;
use crmeb\services\CacheService;
use crmeb\services\FormBuilder as Form;
use crmeb\services\FormBuilder;
use crmeb\services\app\WechatService;
use think\Exception;
use think\facade\Route as Url;

/**
 * Class UserServices
 * @package app\services\user
 * @method array getUserInfoArray(array $where, string $field, string $key) 根据条件查询对应的用户信息以数组形式返回
 * @method update($id, array $data, ?string $key = null) 修改数据
 * @method get($id, ?array $field = [], ?array $with = []) 获取一条数据
 * @method count(array $where) 获取指定条件下的数量
 * @method value(array $where, string $field) 获取指定的键值
 * @method bcInc($key, string $incField, string $inc, string $keyField = null, int $acc = 2) 高精度加法
 * @method bcDec($key, string $incField, string $inc, string $keyField = null, int $acc = 2) 高精度减法
 * @method getTrendData($time, $type, $timeType)
 * @method incPayCount(int $uid) 用户支付成功个数增加
 * @mixin UserDao
 */
class UserServices extends BaseServices
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
     * 获取用户信息
     * @param int $uid
     * @param string $field
     * @return array|\think\Model|null
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/03/01
     */
    public function getUserInfo(int $uid, $field = '*')
    {
        if (is_string($field)) $field = explode(',', $field);
        return $this->dao->get($uid, $field);
    }

    /**
     * 获取用户列表
     * @param array $where
     * @param string $field
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserList(array $where, string $field): array
    {
        [$page, $limit] = $this->getPageValue();
        $list = $this->dao->getList($where, $field, $page, $limit);
        $count = $this->getCount($where);
        return compact('list', 'count');
    }

    /**
     * 列表条数
     * @param array $where
     * @return int
     */
    public function getCount(array $where, bool $is_list = false)
    {
        return $this->dao->getCount($where, $is_list);
    }

    /**
     * 保存用户信息
     * @param $user
     * @param string $userType
     * @return User|\think\Model
     * @throws Exception
     */
    public function setUserInfo($user, string $userType = 'wechat')
    {
        $data = [
            'account' => $user['account'] ?? 'wx' . rand(1, 9999) . time(),
            'pwd' => $user['pwd'] ?? md5('123456'),
            'nickname' => $user['nickname'] ?? '',
            'avatar' => $user['headimgurl'] ?? '',
            'phone' => $user['phone'] ?? '',
            'add_time' => time(),
            'add_ip' => app()->request->ip(),
            'last_time' => time(),
            'last_ip' => app()->request->ip(),
            'user_type' => $userType,
        ];
        $res = $this->dao->save($data);
        if (!$res)
            throw new AdminException('保存用户信息失败');

        //新用户注册奖励
        $this->rewardNewUser((int)$res->uid);

        //用户生成后置事件
        event('UserRegisterListener', [$userType, $user['nickname'], $res->uid, 1]);

        //自定义事件-用户注册
        event('CustomEventListener', ['user_register', [
            'uid' => $res->uid,
            'nickname' => $user['nickname'],
            'phone' => $data['phone'],
            'add_time' => date('Y-m-d H:i:s'),
            'user_type' => $userType,
        ]]);

        return $res;
    }

    /**
     * 根据条件获取用户指定字段列表
     * @param array $where
     * @param string $field
     * @param string $key
     * @return array
     */
    public function getColumn(array $where, string $field = '*', string $key = '')
    {
        return $this->dao->getColumn($where, $field, $key);
    }

    /**
     * 写入用户信息
     * @param array $data
     * @return bool
     */
    public function create(array $data)
    {
        if (!$this->dao->save($data))
            throw new AdminException('保存成功');
        return true;
    }

    /**
     * 重置密码
     * @param $id
     * @param string $password
     * @return mixed
     */
    public function resetPwd(int $uid, string $password)
    {
        if (!$this->dao->update($uid, ['pwd' => $password]))
            throw new AdminException('密码重置失败');
        return true;
    }

    /**
     * 设置用户登录类型
     * @param int $uid
     * @param string $type
     * @return bool
     * @throws Exception
     */
    public function setLoginType(int $uid, string $type = 'h5')
    {
        if (!$this->dao->update($uid, ['login_type' => $type]))
            throw new AdminException('设置登录类型失败');
        return true;
    }

    /**
     * 设置用户分组
     * @param $uids
     * @param int $group_id
     */
    public function setUserGroup($uids, int $group_id)
    {
        return $this->dao->batchUpdate($uids, ['group_id' => $group_id], 'uid');
    }

    /**
     * 获取用户标签
     * @param $uid
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserLablel(array $uids)
    {
        /** @var UserLabelRelationServices $services */
        $services = app()->make(UserLabelRelationServices::class);
        $userlabels = $services->getUserLabelList($uids);
        $data = [];
        foreach ($uids as $uid) {
            $labels = array_filter($userlabels, function ($item) use ($uid) {
                if ($item['uid'] == $uid) {
                    return true;
                }
            });
            $data[$uid] = implode(',', array_column($labels, 'label_name'));
        }
        return $data;
    }

    /**
     * 会员列表
     * @param array $where
     * @return array
     */
    public function index(array $where)
    {
        /** @var UserWechatuserServices $userWechatUser */
        $userWechatUser = app()->make(UserWechatuserServices::class);
        $fields = 'u.*,w.country,w.province,w.city,w.sex,w.unionid,w.openid,w.user_type as w_user_type,w.groupid,w.tagid_list,w.subscribe,w.subscribe_time';
        [$list, $count] = $userWechatUser->getWhereUserList($where, $fields);
        if ($list) {
            $uids = array_column($list, 'uid');
            $userlabel = $this->getUserLablel($uids);
            $userGroup = app()->make(UserGroupServices::class)->getUsersGroupName(array_unique(array_column($list, 'group_id')));
            foreach ($list as &$item) {
                if (empty($item['addres'])) {
                    if (!empty($item['country']) || !empty($item['province']) || !empty($item['city'])) {
                        $item['addres'] = $item['country'] . $item['province'] . $item['city'];
                    }
                }
                $item['status'] = ($item['status'] == 1) ? '正常' : '禁止';
                $item['birthday'] = $item['birthday'] ? date('Y-m-d', (int)$item['birthday']) : '';
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
                if ($item['sex'] == 1) {
                    $item['sex'] = '男';
                } else if ($item['sex'] == 2) {
                    $item['sex'] = '女';
                } else $item['sex'] = '保密';
                //分组名称
                $item['group_id'] = $userGroup[$item['group_id']] ?? '无';
                $item['labels'] = $userlabel[$item['uid']] ?? '';
                if (strpos($item['avatar'], '/statics/system_images/') !== false) {
                    $item['avatar'] = set_file_url($item['avatar']);
                }
            }
        }

        return compact('count', 'list');
    }

    /**
     * 获取修改页面数据
     * @param int $id
     * @return array
     * @throws \FormBuilder\Exception\FormBuilderException
     */
    public function edit(int $id)
    {
        $user = $this->getUserInfo($id);
        if (!$user)
            throw new AdminException('数据不存在');
        $f = array();
        $f[] = Form::input('uid', '用户编号', $user->getData('uid'))->disabled(true);
        $f[] = Form::input('real_name', '真实姓名', $user->getData('real_name'));
        $f[] = Form::input('phone', '手机号码', $user->getData('phone'));

        $f[] = Form::date('birthday', '生日', $user->getData('birthday') ? date('Y-m-d', $user->getData('birthday')) : '');
        $f[] = Form::input('card_id', '身份证号', $user->getData('card_id'));
        $f[] = Form::input('addres', '用户地址', $user->getData('addres'));
        $f[] = Form::textarea('mark', '用户备注', $user->getData('mark'));
        $f[] = Form::input('pwd', '登录密码')->type('password')->placeholder('不改密码请留空');
        $f[] = Form::input('true_pwd', '确认密码')->type('password')->placeholder('不改密码请留空');

        $systemGroupList = app()->make(UserGroupServices::class)->getGroupList();
        $setOptionGroup = function () use ($systemGroupList) {
            $menus = [];
            foreach ($systemGroupList as $menu) {
                $menus[] = ['value' => $menu['id'], 'label' => $menu['group_name']];
            }
            return $menus;
        };
        $f[] = Form::select('group_id', '用户分组', $user->getData('group_id'))->setOptions(FormBuilder::setOptions($setOptionGroup))->filterable(true);
        $systemLabelList = app()->make(UserLabelServices::class)->getLabelList();
        $labels = app()->make(UserLabelRelationServices::class)->getUserLabels($user['uid']);
        $setOptionLabel = function () use ($systemLabelList) {
            $menus = [];
            foreach ($systemLabelList as $menu) {
                $menus[] = ['value' => $menu['id'], 'label' => $menu['label_name']];
            }
            return $menus;
        };
        $f[] = Form::select('label_id', '用户标签', $labels)->setOptions(FormBuilder::setOptions($setOptionLabel))->filterable(true)->multiple(true);
        $f[] = Form::radio('status', '用户状态', $user->getData('status'))->options([['value' => 1, 'label' => '开启'], ['value' => 0, 'label' => '锁定']]);
        return create_form('编辑', $f, Url::buildUrl('/user/user/' . $id), 'PUT');
    }

    /**
     * 添加用户表单
     * @param int $id
     * @return array
     * @throws \FormBuilder\Exception\FormBuilderException
     */
    public function saveForm()
    {
        $f = array();
        $f[] = Form::input('real_name', '真实姓名', '')->placeholder('请输入真实姓名');
        $f[] = Form::input('phone', '手机号码', '')->placeholder('请输入手机号码')->required();
        $f[] = Form::date('birthday', '生日', '')->placeholder('请选择生日');
        $f[] = Form::input('card_id', '身份证号', '')->placeholder('请输入身份证号');
        $f[] = Form::input('addres', '用户地址', '')->placeholder('请输入用户地址');
        $f[] = Form::textarea('mark', '用户备注', '')->placeholder('请输入用户备注');
        $f[] = Form::input('pwd', '登录密码')->type('password')->placeholder('请输入登录密码');
        $f[] = Form::input('true_pwd', '确认密码')->type('password')->placeholder('请再次确认密码');
        $systemGroupList = app()->make(UserGroupServices::class)->getGroupList();
        $setOptionGroup = function () use ($systemGroupList) {
            $menus = [];
            foreach ($systemGroupList as $menu) {
                $menus[] = ['value' => $menu['id'], 'label' => $menu['group_name']];
            }
            return $menus;
        };
        $f[] = Form::select('group_id', '用户分组', '')->setOptions(FormBuilder::setOptions($setOptionGroup))->filterable(true);
        $systemLabelList = app()->make(UserLabelServices::class)->getLabelList();
        $setOptionLabel = function () use ($systemLabelList) {
            $menus = [];
            foreach ($systemLabelList as $menu) {
                $menus[] = ['value' => $menu['id'], 'label' => $menu['label_name']];
            }
            return $menus;
        };
        $f[] = Form::select('label_id', '用户标签', '')->setOptions(FormBuilder::setOptions($setOptionLabel))->filterable(true)->multiple(true);
        $f[] = Form::radio('status', '用户状态', 1)->options([['value' => 1, 'label' => '开启'], ['value' => 0, 'label' => '锁定']]);
        return create_form('添加用户', $f, $this->url('/user/user'), 'POST');
    }

    public function updateInfo(int $id, array $data)
    {
        $user = $this->getUserInfo($id);
        if (!$user) {
            throw new AdminException('数据不存在');
        }
        //余额与积分调整随储值、积分业务一并下线，这里只保留用户资料维护
        if (!isset($data['is_other']) || !$data['is_other']) {
            app()->make(UserLabelRelationServices::class)->setUserLabel([$id], $data['label_id']);
            $edit = [];
            if (isset($data['pwd']) && $data['pwd'] && $data['pwd'] != $user['pwd']) {
                $edit['pwd'] = $data['pwd'];
            }
            $edit['status'] = $data['status'];
            $edit['real_name'] = $data['real_name'];
            $edit['card_id'] = $data['card_id'];
            $edit['birthday'] = strtotime($data['birthday']);
            $edit['mark'] = $data['mark'];
            $edit['phone'] = $data['phone'];
            $edit['addres'] = $data['addres'];
            $edit['group_id'] = $data['group_id'];
            if (!$this->dao->update($id, $edit)) {
                throw new AdminException('修改失败');
            }
        }
        return true;
    }
    /**
     * 设置会员分组
     * @param $id
     * @return mixed
     */
    public function setGroup($uids)
    {
        /** @var UserGroupServices $groupServices */
        $groupServices = app()->make(UserGroupServices::class);
        $userGroup = $groupServices->getGroupList();
        if (count($uids) == 1) {
            $user = $this->getUserInfo($uids[0], ['group_id']);
            $setOptionUserGroup = function () use ($userGroup) {
                $menus = [];
                foreach ($userGroup as $menu) {
                    $menus[] = ['value' => $menu['id'], 'label' => $menu['group_name']];
                }
                return $menus;
            };
            $field[] = Form::select('group_id', '用户分组', $user->getData('group_id') != 0 ? $user->getData('group_id') : '')->setOptions(FormBuilder::setOptions($setOptionUserGroup))->filterable(true);
        } else {
            $setOptionUserGroup = function () use ($userGroup) {
                $menus = [];
                foreach ($userGroup as $menu) {
                    $menus[] = ['value' => $menu['id'], 'label' => $menu['group_name']];
                }
                return $menus;
            };
            $field[] = Form::select('group_id', '用户分组')->setOptions(FormBuilder::setOptions($setOptionUserGroup))->filterable(true);
        }
        $field[] = Form::hidden('uids', implode(',', $uids));
        return create_form('设置用户分组', $field, Url::buildUrl('/user/save_set_group'), 'PUT');
    }

    /**
     * 保存会员分组
     * @param $id
     * @return mixed
     */
    public function saveSetGroup($uids, int $group_id)
    {
        /** @var UserGroupServices $userGroup */
        $userGroup = app()->make(UserGroupServices::class);
        if (!$userGroup->getGroup($group_id)) {
            throw new AdminException('该分组不存在');
        }
        if (!$this->setUserGroup($uids, $group_id)) {
            throw new AdminException('设置分组失败或无改动');
        }
        return true;
    }

    /**
     * 设置用户标签
     * @param $uids
     * @return mixed
     */
    public function setLabel($uids)
    {
        /** @var UserLabelServices $labelServices */
        $labelServices = app()->make(UserLabelServices::class);
        $userLabel = $labelServices->getLabelList();
        if (count($uids) == 1) {
            $lids = app()->make(UserLabelRelationServices::class)->getUserLabels($uids[0]);
            $setOptionUserLabel = function () use ($userLabel) {
                $menus = [];
                foreach ($userLabel as $menu) {
                    $menus[] = ['value' => $menu['id'], 'label' => $menu['label_name']];
                }
                return $menus;
            };
            $field[] = Form::select('label_id', '用户标签', $lids)->setOptions(FormBuilder::setOptions($setOptionUserLabel))->filterable(true)->multiple(true);
        } else {
            $setOptionUserLabel = function () use ($userLabel) {
                $menus = [];
                foreach ($userLabel as $menu) {
                    $menus[] = ['value' => $menu['id'], 'label' => $menu['label_name']];
                }
                return $menus;
            };
            $field[] = Form::select('label_id', '用户标签')->setOptions(FormBuilder::setOptions($setOptionUserLabel))->filterable(true)->multiple(true);
        }
        $field[] = Form::hidden('uids', implode(',', $uids));
        return create_form('设置用户标签', $field, Url::buildUrl('/user/save_set_label'), 'PUT');
    }

    /**
     * 保存用户标签
     * @return mixed
     */
    public function saveSetLabel($uids, $labels, $label_type = 0)
    {
        foreach ($labels as $id) {
            if (!app()->make(UserLabelServices::class)->getLable((int)$id)) {
                throw new AdminException('有标签不存在或被删除');
            }
        }
        /** @var UserLabelRelationServices $services */
        $services = app()->make(UserLabelRelationServices::class);
        if (!$services->setUserLabel($uids, $labels, $label_type)) {
            throw new AdminException('设置标签失败');
        }
        return true;
    }

    /**
     * 用户详细信息
     * @param int $uid
     * @param array $userIfno
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserDetailed(int $uid, $userIfno = [])
    {
        /** @var UserAddressServices $userAddress */
        $userAddress = app()->make(UserAddressServices::class);
        $field = 'real_name,phone,province,city,district,detail,post_code';
        $address = $userAddress->getUserDefaultAddress($uid, $field);
        if (!$address) {
            $address = $userAddress->getUserAddressList($uid, $field);
            $address = $address[0] ?? [];
        }
        $userInfo = $this->getUserInfo($uid);
        return [
            ['name' => '默认收货地址', 'value' => $address ? '收货人:' . $address['real_name'] . '邮编:' . $address['post_code'] . ' 收货人电话:' . $address['phone'] . ' 地址:' . $address['province'] . ' ' . $address['city'] . ' ' . $address['district'] . ' ' . $address['detail'] : ''],
            ['name' => '手机号码', 'value' => $userInfo['phone']],
            ['name' => '姓名', 'value' => ''],
            ['name' => '微信昵称', 'value' => $userInfo['nickname']],
            ['name' => '头像', 'value' => $userInfo['avatar']],
            ['name' => '邮箱', 'value' => ''],
            ['name' => '生日', 'value' => ''],
        ];

    }

    /**
     * 获取用户详情里面的用户消费能力和用户余额积分等
     * @param $uid
     * @return array[]
     */
    public function getHeaderList(int $uid, $userInfo = [])
    {
        if (!$userInfo) {
            $userInfo = $this->getUserInfo($uid);
        }
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $where = ['uid' => $uid, 'paid' => 1, 'refund_status' => 0, 'pid' => 0];
        return [
            [
                'title' => '总计订单',
                'value' => $orderServices->count($where),
                'key' => '笔',
            ],
            [
                'title' => '总消费金额',
                'value' => $orderServices->together($where, 'pay_price'),
                'key' => '元',
            ],
            [
                'title' => '本月订单',
                'value' => $orderServices->count($where + ['time' => 'month']),
                'key' => '笔',
            ],
            [
                'title' => '本月消费金额',
                'value' => $orderServices->together($where + ['time' => 'month'], 'pay_price'),
                'key' => '元',
            ]
        ];
    }


    /**
     * 用户详情
     * @param int $uid
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function read(int $uid)
    {
        $userInfo = $this->getUserInfo($uid);
        if (!$userInfo) {
            throw new AdminException('数据不存在');
        }
        $userInfo['avatar'] = strpos($userInfo['avatar'], 'http') === false ? (sys_config('site_url') . $userInfo['avatar']) : $userInfo['avatar'];
        $userInfo['birthday'] = $userInfo['birthday'] < 0 ? 0 : $userInfo['birthday'];
        if ($userInfo['addres'] == '') {
            $defaultAddressInfo = app()->make(UserAddressServices::class)->getUserDefaultAddress($uid);
            if ($defaultAddressInfo) {
                $userInfo['addres'] = $defaultAddressInfo['province'] . $defaultAddressInfo['city'] . $defaultAddressInfo['district'] . $defaultAddressInfo['detail'];
            } else {
                $userInfo['addres'] = '';
            }
        }
        $userInfo['group_name'] = app()->make(UserGroupServices::class)->value(['id' => $userInfo['group_id']], 'group_name');
        $userInfo['label_list'] = implode(',', array_column(app()->make(UserLabelRelationServices::class)->getUserLabelList([$uid]), 'label_name'));
        return [
            'uid' => $uid,
            'userinfo' => $this->getUserDetailed($uid, $userInfo),
            'headerList' => $this->getHeaderList($uid, $userInfo),
            'ps_info' => $userInfo
        ];
    }

    /**
     * 获取单个用户信息
     * @param $id 用户id
     * @return mixed
     */
    public function oneUserInfo(int $id, string $type)
    {
        switch ($type) {
            case 'order':
                /** @var StoreOrderServices $services */
                $services = app()->make(StoreOrderServices::class);
                return $services->getUserOrderList($id);
            case 'coupon':
                /** @var StoreCouponUserServices $services */
                $services = app()->make(StoreCouponUserServices::class);
                return $services->getUserCouponList($id);
            default:
                throw new AdminException('参数错误');
        }
    }

    /**获取特定时间用户访问量
     * @param $time
     * @param $week
     * @return int
     */
    public function todayLastVisits($time, $week)
    {
        return $this->dao->todayLastVisit($time, $week);
    }

    /**获取特定时间新增用户
     * @param $time
     * @param $week
     * @return int
     */
    public function todayAddVisits($time, $week)
    {
        return $this->dao->todayAddVisit($time, $week);
    }

    /**
     * 用户图表
     */
    public function userChart()
    {
        $starday = date('Y-m-d', strtotime('-30 day'));
        $yesterday = date('Y-m-d', strtotime('+1 day'));

        $user_list = $this->dao->userList($starday, $yesterday);
        $chartdata = [];
        $data = [];
        $chartdata['legend'] = ['用户数'];//分类
        $chartdata['yAxis']['maxnum'] = 0;//最大值数量
        $chartdata['xAxis'] = [date('m-d')];//X轴值
        $chartdata['series'] = [0];//分类1值
        if (!empty($user_list)) {
            foreach ($user_list as $k => $v) {
                $data['day'][] = $v['day'];
                $data['count'][] = $v['count'];
                if ($chartdata['yAxis']['maxnum'] < $v['count'])
                    $chartdata['yAxis']['maxnum'] = $v['count'];
            }
            $chartdata['xAxis'] = $data['day'];//X轴值
            $chartdata['series'] = $data['count'];//分类1值
        }
        $chartdata['bing_xdata'] = ['未消费用户', '消费一次用户', '留存客户', '回流客户'];
        $color = ['#5cadff', '#b37feb', '#19be6b', '#ff9900'];
        $pay[0] = $this->dao->count(['pay_count' => 0]);
        $pay[1] = $this->dao->count(['pay_count' => 1]);
        $pay[2] = $this->dao->userCount(1);
        $pay[3] = $this->dao->userCount(2);
        foreach ($pay as $key => $item) {
            $bing_data[] = ['name' => $chartdata['bing_xdata'][$key], 'value' => $pay[$key], 'itemStyle' => ['color' => $color[$key]]];
        }
        $chartdata['bing_data'] = $bing_data;
        return $chartdata;
    }

    /***********************************************/
    /************ 前端api services *****************/
    /***********************************************/

    public function personalHome(array $user, $tokenData)
    {
        $userInfo = $user;
        $uid = (int)$user['uid'];
        /** @var StoreCouponUserServices $storeCoupon */
        $storeCoupon = app()->make(StoreCouponUserServices::class);
        /** @var StoreOrderServices $storeOrder */
        $storeOrder = app()->make(StoreOrderServices::class);
        /** @var WechatUserServices $wechatUser */
        $wechatUser = app()->make(WechatUserServices::class);
        /** @var UserInvoiceServices $userInvoice */
        $userInvoice = app()->make(UserInvoiceServices::class);
        /** @var StoreProductRelationServices $collect */
        $collect = app()->make(StoreProductRelationServices::class);
        /** @var MessageSystemServices $messageSystemServices */
        $messageSystemServices = app()->make(MessageSystemServices::class);
        /** @var DiyServices $diyServices */
        $diyServices = app()->make(DiyServices::class);

        $wechatUserInfo = $wechatUser->getOne(['uid' => $uid, 'user_type' => $tokenData['type']]);
        $user['is_complete'] = $wechatUserInfo['is_complete'] ?? 0;
        $user['couponCount'] = $storeCoupon->getUserValidCouponCount((int)$uid);
        $user['like'] = $collect->getUserCollectCount($user['uid']);
        $user['orderStatusNum'] = $storeOrder->getOrderData($uid);
        $user['notice'] = $messageSystemServices->count(['uid' => $uid, 'look' => 0, 'is_del' => 0]);
        if ($user['phone'] && $user['user_type'] != 'h5') {
            $user['switchUserInfo'][] = $userInfo;
            $h5UserInfo = $this->dao->getOne(['account' => $user['phone'], 'user_type' => 'h5']);
            if ($h5UserInfo) {
                $user['switchUserInfo'][] = $h5UserInfo;
            }
        } else if ($user['phone'] && $user['user_type'] == 'h5') {
            $wechatUserInfo = $this->getOne([['phone', '=', $user['phone']], ['user_type', '<>', 'h5']]);
            if ($wechatUserInfo) {
                $user['switchUserInfo'][] = $wechatUserInfo;
            }
            $user['switchUserInfo'][] = $userInfo;
        } else if (!$user['phone']) {
            $user['switchUserInfo'][] = $userInfo;
        }
        $invoice_func = $userInvoice->invoiceFuncStatus();
        $user['invioce_func'] = $invoice_func['invoice_func'];
        $user['special_invoice'] = $invoice_func['special_invoice'];
        $user['collectCount'] = $collect->count(['uid' => $uid]);
        $user['member_style'] = (int)$diyServices->getColorChange('member');
        $user['is_default_avatar'] = $user['avatar'] == sys_config('h5_avatar') ? 1 : 0;
        $user['avatar'] = strpos($user['avatar'], '/statics/system_images/') !== false ? set_file_url($user['avatar']) : $user['avatar'];
        $user['visit_num'] = app()->make(StoreProductLogServices::class)->getCountByUser($uid);
        return $user;
    }
    /**
     * 用户修改信息
     * @param Request $request
     * @return mixed
     */
    public function eidtNickname(int $uid, array $data)
    {
        $info = $this->dao->get(['uid' => $uid]);
        if (!$info) {
            throw new ApiException('用户不存在');
        }
        if (!$this->dao->update($uid, $data, 'uid')) {
            throw new ApiException('修改失败');
        }

        //自定义事件-用户修改信息
        event('CustomEventListener', ['user_change_info', [
            'uid' => $uid,
            'nickname' => $info['nickname'],
            'phone' => $info['phone'],
            'avatar' => $info['avatar'],
            'add_time' => date('Y-m-d H:i:s', $info['add_time']),
            'user_type' => $info['user_type'],
        ]]);

        return true;
    }

    /**
     * 添加访问记录
     * @param Request $request
     * @return mixed
     */
    public function setVisit(array $data)
    {
        $userInfo = $this->getUserInfo($data['uid'], 'uid,user_type');
        if (!$userInfo) {
            throw new ApiException('数据不存在');
        }
        $data['channel_type'] = $userInfo['user_type'];
        $data['add_time'] = time();
        /** @var WechatUserServices $wechatUserServices */
        $wechatUserServices = app()->make(WechatUserServices::class);
        $wechatUser = $wechatUserServices->get(['uid' => $userInfo['uid'], 'user_type' => $userInfo['user_type']]);
        if (!$wechatUser) {
            $wechatUser = $wechatUserServices->get(['uid' => $userInfo['uid']]);
        }
        if ($wechatUser) {
            $data['province'] = $wechatUser['province'];
        }
        /** @var UserVisitServices $userVisit */
        $userVisit = app()->make(UserVisitServices::class);
        if ($userVisit->save($data)) {
            return true;
        } else {
            throw new ApiException('设置失败');
        }
    }

    /**
     * 同步微信粉丝用户(后台接口)
     * @return bool
     */
    public function syncWechatUsers()
    {
        $appid = sys_config('wechat_appid');
        $appSecret = sys_config('wechat_appsecret');
        if (!$appid || !$appSecret) {
            throw new AdminException('请先配置小程序appid、appSecret等参数');
        }
        $key = md5('sync_wechat_users');
        //一天点击一次
        if (CacheService::get($key)) {
            return true;
        }
        $next_openid = null;
        do {
            $result = WechatService::getUsersList($next_openid);
            $userOpenids = $result['data'];
            //拆分大数组
            $opemidArr = array_chunk($userOpenids, 100);
            foreach ($opemidArr as $openids) {
                //加入同步|更新用户队列
                UserJob::dispatch([$openids]);
            }
            $next_openid = $result['next_openid'];
        } while ($next_openid != null);
        CacheService::set($key, 1, 3600 * 24);
        return true;
    }

    /**
     * 导入微信粉丝用户
     * @param array $openids
     * @return bool
     */
    public function importUser(array $noBeOpenids)
    {
        if (!$noBeOpenids) {
            return true;
        }
        $dataAll = $data = [];
        $time = time();
        foreach ($noBeOpenids as $openid) {
            try {
                $info = WechatService::getUserInfo($openid);
                $info = is_object($info) ? $info->toArray() : $info;
            } catch (\Throwable $e) {
                $info = [];
            }
            if (!$info) continue;
            $data['nickname'] = $info['nickname'] ?? '';
            $data['headimgurl'] = $info['headimgurl'] ?? '';
            $userInfoData = $this->setUserInfo($data);
            if (!$userInfoData) {
                throw new AdminException('用户信息储存失败');
            }
            $data['uid'] = $userInfoData['uid'];
            $data['subscribe'] = $info['subscribe'] ?? 1;
            $data['unionid'] = $info['unionid'] ?? '';
            $data['openid'] = $info['openid'] ?? '';
            $data['sex'] = $info['sex'] ?? 0;
            $data['language'] = $info['language'] ?? '';
            $data['city'] = $info['city'] ?? '';
            $data['province'] = $info['province'] ?? '';
            $data['country'] = $info['country'] ?? '';
            $data['subscribe_time'] = $info['subscribe_time'] ?? '';
            $data['groupid'] = $info['groupid'] ?? 0;
            $data['remark'] = $info['remark'] ?? '';
            $data['tagid_list'] = isset($info['tagid_list']) && $info['tagid_list'] ? implode(',', $info['tagid_list']) : '';
            $data['add_time'] = $time;
            $data['is_complete'] = 1;
            $dataAll[] = $data;
        }
        if ($dataAll) {
            /** @var WechatUserServices $wechatUser */
            $wechatUser = app()->make(WechatUserServices::class);
            if (!$wechatUser->saveAll($dataAll)) {
                throw new AdminException('用户信息储存失败');
            }
        }
        return true;
    }

    /**
     * @param array $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserInfoList(array $where, $field = "*")
    {
        return $this->dao->getUserInfoList($where, $field);
    }

    /**
     * 添加编辑用户信息时候的信息
     * @param $uid
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserSaveInfo($uid)
    {
        /** @var UserLabelServices $userLabelServices */
        $userLabelServices = app()->make(UserLabelServices::class);
        /** @var UserLabelRelationServices $userLabelRelationServices */
        $userLabelRelationServices = app()->make(UserLabelRelationServices::class);
        /** @var UserLabelCateServices $userLabelCateServices */
        $userLabelCateServices = app()->make(UserLabelCateServices::class);
        /** @var UserGroupServices $userGroupServices */
        $userGroupServices = app()->make(UserGroupServices::class);
        $userInfo = $this->dao->get($uid);
        if ($userInfo) {
            $label_ids = $userLabelRelationServices->getUserLabels($uid);
            $userInfo['label_id'] = !empty($label_ids) ? $userLabelServices->getLabelList(['ids' => $label_ids], ['id', 'label_name']) : [];
            $userInfo['birthday'] = (int)$userInfo['birthday'] ? date('Y-m-d', (int)$userInfo['birthday']) : '';
            $userInfo['group_id'] = $userInfo['group_id'] != 0 ? $userInfo['group_id'] : '';
            if ($userInfo['addres'] == '') {
                $defaultAddressInfo = app()->make(UserAddressServices::class)->getUserDefaultAddress($uid);
                if ($defaultAddressInfo) {
                    $userInfo['addres'] = $defaultAddressInfo['province'] . $defaultAddressInfo['city'] . $defaultAddressInfo['district'] . $defaultAddressInfo['detail'];
                } else {
                    $userInfo['addres'] = '';
                }
            }
        }
        $groupInfo = $userGroupServices->getGroupList();
        $labelInfo = $userLabelCateServices->getUserLabel($uid);
        return compact('userInfo', 'groupInfo', 'labelInfo');
    }


    /**
     * 新用户注册奖励
     * @param int $id
     * @return bool
     * @throws Exception
     *
     * @date 2022/09/28
     * @author yyw
     */
    public function rewardNewUser(int $id)
    {
        // New-user rewards are coupons, issued by RegisterListener.
        return true;
    }

    /**
     * 推送用户信息
     * @param $data
     * @param $pushUrl
     * @return bool
     */
    public function userUpdate($data, $pushUrl)
    {
        return out_push($pushUrl, $data, '更新用户信息');
    }
}
