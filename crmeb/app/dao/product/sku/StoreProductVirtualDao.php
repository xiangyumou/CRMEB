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
namespace app\dao\product\sku;


use app\dao\BaseDao;
use app\model\product\sku\StoreProductVirtual;

class StoreProductVirtualDao extends BaseDao
{
    /**
     * 设置模型
     * @return string
     */
    protected function setModel(): string
    {
        return StoreProductVirtual::class;
    }

    /**
     * 原子占用一张未售出的卡密
     *
     * get-then-save 会让两个并发订单拿到同一张卡：这里用一条带条件的更新来
     * 认领，受影响行数为 1 才算领取成功；被别人抢先时继续尝试下一张，绝不
     * 把已经发出去的卡再发给第二个订单。
     *
     * @param string $attrUnique
     * @param string $orderId
     * @param int $uid
     * @return array|null 领取到的卡密行
     */
    public function claimCard(string $attrUnique, string $orderId, int $uid)
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $candidate = $this->getModel()
                ->where('attr_unique', $attrUnique)
                ->where('uid', 0)
                ->where('order_id', '')
                ->order('id')
                ->find();
            if (!$candidate) {
                return null;
            }
            $affected = $this->getModel()
                ->where('id', (int)$candidate['id'])
                ->where('uid', 0)
                ->where('order_id', '')
                ->update(['uid' => $uid, 'order_id' => $orderId]);
            if ($affected === 1) {
                $row = $this->get((int)$candidate['id']);

                return $row ? $row->toArray() : null;
            }
            //被别人抢先占用：重新取下一张
        }

        return null;
    }

    /**
     * 订单已经领到的卡密（重试时复用，不重复发卡）
     *
     * @param string $orderId
     * @return array|null
     */
    public function findByOrderId(string $orderId)
    {
        if ($orderId === '') {
            return null;
        }
        $row = $this->getModel()->where('order_id', $orderId)->find();

        return $row ? $row->toArray() : null;
    }
}