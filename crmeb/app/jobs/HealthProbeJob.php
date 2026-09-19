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

namespace app\jobs;

use crmeb\basic\BaseJobs;
use crmeb\traits\QueueTrait;
use crmeb\utils\HealthHeartbeat;

/**
 * 容器健康探针。
 *
 * 定时任务每 30 秒投递一次，只有队列容器真的在消费任务时才会返回，
 * 队列角色据此写入自己的心跳。探针不读写任何业务表，也不写日志。
 */
class HealthProbeJob extends BaseJobs
{
    use QueueTrait;

    /**
     * @return bool
     */
    public function doJob(): bool
    {
        return HealthHeartbeat::write('queue');
    }
}
