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

namespace app\api\controller\v1;


use app\Request;
use crmeb\services\app\MiniProgramService;
use crmeb\services\pay\Pay;

/**
 * 支付回调
 * Class PayController
 * @package app\api\controller\v1
 */
class PayController
{

    /**
     * 支付回调
     * @param string $type
     * @return string|void
     * @throws \EasyWeChat\Core\Exceptions\FaultException
     */
    public function notify(string $type)
    {
        switch (urldecode($type)) {
            case 'v3wechat':
                return app()->make(Pay::class, ['v3_wechat_pay'])->handleNotify()->getContent();
            case 'routine':
                return MiniProgramService::handleNotify();
            case 'wechat':
                if (sys_config('pay_wechat_type')) {
                    /** @var Pay $pay */
                    $pay = app()->make(Pay::class, ['v3_wechat_pay']);
                } else {
                    /** @var Pay $pay */
                    $pay = app()->make(Pay::class);
                }
                return $pay->handleNotify()->getContent();
            default:
                return \think\Response::create()->code(404);
        }
    }

    /**
     * 支付配置
     * @param Request $request
     * @return mixed
     */
    public function config(Request $request)
    {
        $config = [
            [
                'icon' => 'icon-weixinzhifu',
                'name' => '微信支付',
                'value' => 'weixin',
                'title' => '使用微信快捷支付',
                'number' => null,
                'payStatus' => sys_config('pay_weixin_open', '') === 'weixin',
            ],
            [
                'icon' => 'icon-haoyoudaizhifu',
                'name' => '好友代付',
                'value' => 'friend',
                'title' => '找微信好友支付',
                'number' => null,
                'payStatus' => !!sys_config('friend_pay_status', 0),
            ]
        ];

        return app('json')->success($config);
    }

    public function transferNotify()
    {
        return app()->make(Pay::class, ['v3_wechat_pay'])->handleTransferNotify()->getContent();
    }
}
