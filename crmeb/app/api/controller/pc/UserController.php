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

namespace app\api\controller\pc;


use app\Request;
use app\services\pc\UserServices;

class UserController
{
    protected $services;

    public function __construct(UserServices $services)
    {
        $this->services = $services;
    }

    /**
     * 获取收藏列表
     * @param Request $request
     * @return mixed
     */
    public function getCollectList(Request $request)
    {
        $uid = (int)$request->uid();
        return app('json')->success($this->services->getCollectList($uid));
    }
}
