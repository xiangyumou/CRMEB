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
namespace app\adminapi\controller\v1\export;

use app\adminapi\controller\AuthController;
use app\services\activity\combination\StoreCombinationServices;
use app\services\activity\combination\StorePinkServices;
use app\services\other\export\ExportServices;
use app\services\order\StoreOrderServices;
use app\services\product\product\StoreProductServices;
use app\services\user\UserBillServices;
use app\services\wechat\WechatUserServices;
use think\facade\App;

/**
 * 导出excel类
 * Class ExportExcel
 * @package app\adminapi\controller\v1\export
 */
class ExportExcel extends AuthController
{
    /**
     * @var ExportServices
     */
    protected $service;

    /**
     * ExportExcel constructor.
     * @param App $app
     * @param ExportServices $services
     */
    public function __construct(App $app, ExportServices $services)
    {
        parent::__construct($app);
        $this->service = $services;
    }

    public function userList()
    {
        $where = $this->request->getMore([
            ['page', 1],
            ['limit', 20],
            ['nickname', ''],
            ['status', ''],
            ['pay_count', ''],
            ['is_promoter', ''],
            ['order', ''],
            ['data', ''],
            ['user_type', ''],
            ['country', ''],
            ['province', ''],
            ['city', ''],
            ['user_time_type', ''],
            ['user_time', ''],
            ['sex', ''],
            [['level', 0], 0],
            [['group_id', 'd'], 0],
            ['label_id', ''],
            ['now_money', 'normal'],
            ['field_key', ''],
            ['isMember', ''],
            ['ids', []]
        ]);
        return app('json')->success($this->service->exportUserList($where));
    }

    /**
     * 订单导出
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function orderList()
    {
        $where = $this->request->getMore([
            ['status', ''],
            ['real_name', ''],
            ['is_del', ''],
            ['data', '', '', 'time'],
            ['type', ''],
            ['pay_type', ''],
            ['order', ''],
            ['field_key', ''],
            ['ids', []],
        ]);
        $where['is_system_del'] = 0;
        $where['pid'] = 0;
        return app('json')->success($this->service->exportOrderList($where));
    }

    /**
     * 发货订单列表导出
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function orderDeliveryList()
    {
        return app('json')->success($this->service->exportOrderDeliveryList());
    }

    /**
     * 商品列表导出
     * @return mixed
     */
    public function productList()
    {
        $where = $this->request->getMore([
            ['store_name', ''],
            ['cate_id', ''],
            ['type', 1],
            ['ids', []]
        ]);
        return app('json')->success($this->service->exportProductList($where));
    }

    /**
     * 拼团商品导出
     * @return mixed
     */
    public function combinationList()
    {
        $where = $this->request->getMore([
            ['is_show', ''],
            ['store_name', '']
        ]);
        $where['is_del'] = 0;
        return app('json')->success($this->service->exportCombinationList($where));
    }

    /**
     * 拼团导出
     * @param StoreCombinationServices $services
     * @return mixed
     */
    public function storeCombination(StoreCombinationServices $services)
    {
        $where = $this->request->getMore([
            ['start_status', ''],
            ['is_show', ''],
            ['store_name', ''],
        ]);
        $data = $services->getList($where);
        /** @var StorePinkServices $storePinkServices */
        $storePinkServices = app()->make(StorePinkServices::class);
        $countAll = $storePinkServices->getPinkCount([]);
        $countTeam = $storePinkServices->getPinkCount(['k_id' => 0, 'status' => 2]);
        $countPeople = $storePinkServices->getPinkCount(['k_id' => 0]);
        foreach ($data as &$item) {
            $item['count_people'] = $countPeople[$item['id']] ?? 0;//拼团数量
            $item['count_people_all'] = $countAll[$item['id']] ?? 0;//参与人数
            $item['count_people_pink'] = $countTeam[$item['id']] ?? 0;//成团数量
            $item['stop_status'] = $item['stop_time'] < time() ? 1 : 0;
            if ($item['is_show']) {
                if ($item['start_time'] > time())
                    $item['start_name'] = '未开始';
                else if ($item['stop_time'] < time())
                    $item['start_name'] = '已结束';
                else if ($item['stop_time'] > time() && $item['start_time'] < time()) {
                    $item['start_name'] = '进行中';
                }
            } else $item['start_name'] = '已结束';
        }
        return app('json')->success($this->service->storeCombination($data));
    }

    /**
     * 商品导出
     * @param StoreProductServices $services
     * @return mixed
     */
    public function storeProduct(StoreProductServices $services)
    {
        $where = $this->request->getMore([
            ['store_name', ''],
            ['cate_id', ''],
            ['type', 1]
        ]);
        $data = $services->searchList($where, true, false);
        return app('json')->success($this->service->storeProduct($data['list'] ?? []));
    }

    /**
     * 订单列表导出
     * @param StoreOrderServices $services
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function storeOrder(StoreOrderServices $services)
    {
        $where = $this->request->getMore([
            ['status', ''],
            ['real_name', ''],
            ['data', '', '', 'time']
        ]);
        $where['pid'] = 0;
        $ids = $this->request->get('ids');
        if ($ids) {
            $idsArr = array_filter(explode(',', $ids));
            if ($idsArr) {
                $where['id'] = $idsArr;
            }
        }
        $data = $services->getExportList($where);
        return app('json')->success($this->service->storeOrder($data));
    }

}
