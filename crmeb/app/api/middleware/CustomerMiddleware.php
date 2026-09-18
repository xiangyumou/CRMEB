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
namespace app\api\middleware;

use app\services\CoreStore;
use crmeb\interfaces\MiddlewareInterface;
use app\Request;

class CustomerMiddleware implements MiddlewareInterface
{

    public function handle(Request $request, \Closure $next)
    {
        $uid = (int)$request->uid();
        if (!in_array($uid, CoreStore::orderAdminUids(), true))
            return app('json')->fail('权限不足');
        return $next($request);
    }
}
