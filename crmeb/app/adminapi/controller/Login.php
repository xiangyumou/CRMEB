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
namespace app\adminapi\controller;

use think\facade\App;
use crmeb\utils\Captcha;
use app\services\system\admin\AdminLoginGuard;
use app\services\system\admin\SystemAdminServices;

/**
 * 后台登陆
 * Class Login
 * @package app\adminapi\controller
 */
class Login extends AuthController
{

    /**
     * @var SystemAdminServices
     */
    protected $services;

    /**
     * Login constructor.
     * @param App $app
     * @param SystemAdminServices $services
     */
    public function __construct(App $app, SystemAdminServices $services)
    {
        parent::__construct($app);
        $this->services = $services;
    }

    protected function initialize()
    {
        // TODO: Implement initialize() method.
    }

    /**
     * 验证码
     * @return $this|\think\Response
     */
    public function captcha()
    {
        return app()->make(Captcha::class)->create();
    }

    /**
     * @return mixed
     */
    public function ajcaptcha()
    {
        $captchaType = $this->request->get('captchaType');
        return app('json')->success(aj_captcha_create($captchaType));
    }

    /**
     * 一次验证
     * @return mixed
     */
    public function ajcheck()
    {
        [$token, $pointJson, $captchaType] = $this->request->postMore([
            ['token', ''],
            ['pointJson', ''],
            ['captchaType', ''],
        ], true);
        try {
            aj_captcha_check_one($captchaType, $token, $pointJson);
            return app('json')->success();
        } catch (\Throwable $e) {
            return app('json')->fail('验证码错误');
        }
    }

    /**
     * 登陆
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function login()
    {
        [$account, $password, $key, $captchaVerification, $captchaType] = $this->request->postMore([
            'account',
            'pwd',
            ['key', ''],
            ['captchaVerification', ''],
            ['captchaType', '']
        ], true);

        $ip = (string)$this->request->ip();
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);

        // 锁定和验证码要求都在校验口令之前判定，所以被拒绝的请求不会泄露口令对错。
        $locked = $guard->lockedSeconds((string)$account, $ip);
        if ($locked > 0) {
            return app('json')->fail('登录失败次数过多，请在' . (int)ceil($locked / 60) . '分钟后重试', ['login_captcha' => 1]);
        }

        // 人机验证由服务端要求，不再由前端决定送不送：少了这一条，登录接口可以被无限爆破。
        if ($guard->captchaRequired((string)$account, $ip)) {
            if ($captchaVerification == '') {
                return app('json')->fail('请先完成安全验证', ['login_captcha' => 1]);
            }
        }
        if ($captchaVerification != '') {
            try {
                aj_captcha_check_two($captchaType, $captchaVerification);
            } catch (\Throwable $e) {
                return app('json')->fail('验证码错误', ['login_captcha' => 1]);
            }
        }

        if (strlen(trim($password)) < 6 || strlen(trim($password)) > 32) {
            $guard->recordFailure((string)$account, $ip);
            return app('json')->fail('账号密码必须是在6到32位之间', ['login_captcha' => 1]);
        }

        $this->validate(['account' => $account, 'pwd' => $password], \app\adminapi\validate\setting\SystemAdminValidata::class, 'get');
        $result = $this->services->login($account, $password, 'admin', $key);
        if (!$result) {
            $guard->recordFailure((string)$account, $ip);
            return app('json')->fail('账号或密码错误', ['login_captcha' => 1]);
        }
        $guard->clear((string)$account, $ip);
        return app('json')->success($result);
    }

    /**
     * 获取后台登录页轮播图以及LOGO
     * @return mixed
     */
    public function info()
    {
        return app('json')->success($this->services->getLoginInfo());
    }
}
