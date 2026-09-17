<?php

use think\facade\Route;

Route::get('surl/:id', function(\app\Request $request){
    return app()->make(\app\api\controller\v1\PublicController::class)->getSchemeUrl($request->param('id'));
});

Route::miss(function () {
    $appRequest = request()->pathinfo();
    if ($appRequest === null) {
        $appName = '';
    } else {
        $appRequest = str_replace('//', '/', $appRequest);
        $appName = explode('/', $appRequest)[0] ?? '';
    }

    if (in_array(strtolower($appName), ['api', 'adminapi', 'kefuapi', 'kefu'], true)) {
        return \think\Response::create()->code(404);
    }

    switch (strtolower($appName)) {
        case config('app.admin_prefix', 'admin'):
        case 'app':
            return view(app()->getRootPath() . 'public' . DS . config('app.admin_prefix', 'admin') . DS . 'index.html')
                ->header(['Cache-Control' => 'no-cache, must-revalidate']);
        case 'home':
            if (request()->isMobile()) {
                return redirect(app()->route->buildUrl('/'));
            } else {
                return view(app()->getRootPath() . 'public' . DS . 'home' . DS . 'index.html')
                    ->header(['Cache-Control' => 'no-cache, must-revalidate']);
            }
        case 'pages':
            return view(app()->getRootPath() . 'public' . DS . 'index.html')
                ->header(['Cache-Control' => 'no-cache, must-revalidate']);
        default:
            if (!request()->isMobile()) {
                if (is_dir(app()->getRootPath() . 'public' . DS . 'home') && !request()->get('mdType')) {
                    return view(app()->getRootPath() . 'public' . DS . 'home' . DS . 'index.html')
                        ->header(['Cache-Control' => 'no-cache, must-revalidate']);
                } else {
                    if (request()->get('type')) {
                        return view(app()->getRootPath() . 'public' . DS . 'index.html')
                            ->header(['Cache-Control' => 'no-cache, must-revalidate']);
                    } else {
                        return view(app()->getRootPath() . 'public' . DS . 'mobile.html', ['siteName' => sys_config('site_name'), 'siteUrl' => sys_config('site_url') . '/pages/index/index'])
                            ->header(['Cache-Control' => 'no-cache, must-revalidate']);
                    }
                }
            } else {
                return view(app()->getRootPath() . 'public' . DS . 'index.html')
                    ->header(['Cache-Control' => 'no-cache, must-revalidate']);
            }
    }
});
