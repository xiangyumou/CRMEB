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
namespace crmeb\command;


use app\services\system\log\SystemFileInfoServices;
use app\services\system\SystemClearServices;
use app\services\system\SystemRouteServices;
use think\console\Command;
use think\console\Input;
use think\console\input\Argument;
use think\console\input\Option;
use think\console\Output;

class Util extends Command
{
    protected function configure()
    {
        $this->setName('util')
            ->addArgument('type', Argument::REQUIRED, '类型replace/route/file/apifox')
            ->addOption('h', null, Option::VALUE_REQUIRED, '替换成当前域名')
            ->addOption('u', null, Option::VALUE_REQUIRED, '替换的域名')
            ->addOption('a', null, Option::VALUE_REQUIRED, '应用名')
            ->addOption('f', null, Option::VALUE_REQUIRED, '导入文件路径，文件只能在项目根目录下或者根目录下的其他文件夹内')
            ->setDescription('工具类');
    }

    protected function execute(Input $input, Output $output)
    {
        $type = $input->getArgument('type');

        switch ($type) {
            case 'replace':
                $host = $input->getOption('h');
                $url = $input->getOption('u');
                if (!$host) {
                    return $output->error('缺少替换域名');
                }
                if (!$url) {
                    return $output->error('缺少替换的域名');
                }
                $this->replaceSiteUrl($url, $host);
                break;
            case 'route':
                $appName = $input->getOption('a');
                if (!$appName) {
                    return $output->error('缺少应用名称');
                }
                app()->make(SystemRouteServices::class)->syncRoute($appName);
                break;
            case 'file':
                app()->make(SystemFileInfoServices::class)->syncfile();
                break;
            case 'apifox':
                $filePath = $input->getOption('f');
                if (!$filePath) {
                    return $output->error('缺少导入文件地址');
                }
                app()->make(SystemRouteServices::class)->import($filePath);
                break;
        }

        $output->info('执行成功');
    }

    protected function replaceSiteUrl(string $url, string $siteUrl)
    {
        // The table list lives in the service so the console command, the admin
        // button and the tests all rewrite the same retained tables.
        return app()->make(SystemClearServices::class)->replaceSiteUrl($url, $siteUrl);
    }
}
