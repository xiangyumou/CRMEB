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

namespace app\dao\order;

use app\dao\BaseDao;
use app\model\order\StoreOrderEffect;

/**
 * 订单支付后置副作用
 * Class StoreOrderEffectDao
 * @package app\dao\order
 */
class StoreOrderEffectDao extends BaseDao
{
    /**
     * 设置模型
     * @return string
     */
    protected function setModel(): string
    {
        return StoreOrderEffect::class;
    }

    /**
     * 需要处理或补投的副作用ID
     *
     * 待处理、结果未知，以及被中断的进程留在"执行中"状态且已超时的记录。
     * 超过最大次数的记录不再自动重投，保留现场等待人工确认。
     *
     * @param int $limit
     * @return array
     */
    public function pendingIds(int $limit = 50): array
    {
        return $this->getModel()
            ->whereRaw(
                '(status IN (?, ?) OR (status = ? AND update_time < ?))',
                [
                    StoreOrderEffect::STATUS_PENDING,
                    StoreOrderEffect::STATUS_UNKNOWN,
                    StoreOrderEffect::STATUS_RUNNING,
                    time() - StoreOrderEffect::STALE_SECONDS,
                ]
            )
            ->where('attempts', '<', StoreOrderEffect::MAX_ATTEMPTS)
            ->order('id asc')
            ->limit($limit)
            ->column('id');
    }

    /**
     * 领取一条副作用，保证同一时刻只有一个进程执行同一条记录
     *
     * 条件是"仍未完成且没有被其它进程领取"，超时的"执行中"记录可以被重新领取。
     * 只有影响一行的调用方才有权执行外部动作。
     *
     * @param int $id
     * @param int $attempts 本次处理后的累计次数
     * @return bool
     */
    public function claim(int $id, int $attempts): bool
    {
        $now = time();
        $affected = $this->getModel()
            ->where('id', $id)
            ->where('attempts', '<', StoreOrderEffect::MAX_ATTEMPTS)
            ->whereRaw(
                '(status IN (?, ?) OR (status = ? AND update_time < ?))',
                [
                    StoreOrderEffect::STATUS_PENDING,
                    StoreOrderEffect::STATUS_UNKNOWN,
                    StoreOrderEffect::STATUS_RUNNING,
                    $now - StoreOrderEffect::STALE_SECONDS,
                ]
            )
            ->update([
                'status' => StoreOrderEffect::STATUS_RUNNING,
                'attempts' => $attempts,
                'update_time' => $now,
            ]);
        return (int)$affected === 1;
    }

}
