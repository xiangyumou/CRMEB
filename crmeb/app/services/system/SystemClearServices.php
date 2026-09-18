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

namespace app\services\system;


use app\services\BaseServices;
use crmeb\exceptions\AdminException;
use think\facade\Config;
use think\facade\Db;
use think\facade\Log;

/**
 * 清除数据
 * Class SystemClearServices
 * @package app\services\system
 */
class SystemClearServices extends BaseServices
{
    /**
     * Retained tables that store media URLs, with the columns to rewrite.
     * Retired-feature tables are gone from the database, so listing them here
     * would abort the whole replacement on the first missing table.
     * Each entry is [column, escapes slashes] — the second form matches the
     * `\/` escaping the JSON columns use.
     * @var array<string, array<int, array{0: string, 1: bool}>>
     */
    protected $siteUrlColumns = [
        'agreement' => [['content', false]],
        'article' => [['image_input', false]],
        'article_category' => [['image', false]],
        'article_content' => [['content', false]],
        'cache' => [['result', true]],
        'diy' => [['value', true], ['default_value', true]],
        'out_interface' => [['return_params', false], ['request_example', false], ['return_example', false]],
        'qrcode' => [['url', false], ['qrcode_url', false]],
        'store_category' => [['pic', false], ['big_pic', false]],
        'store_combination' => [['image', false], ['images', true]],
        'store_order_cart_info' => [['cart_info', true]],
        'store_order_refund' => [['refund_img', false], ['cart_info', true]],
        'store_pink' => [['avatar', false]],
        'store_product' => [['image', false], ['slider_image', true], ['recommend_image', false]],
        'store_product_attr_result' => [['result', true]],
        'store_product_attr_value' => [['image', false]],
        'store_product_description' => [['description', false]],
        'store_product_reply' => [['avatar', false], ['pics', true]],
        'system_admin' => [['head_pic', false]],
        'system_attachment' => [['att_dir', false], ['satt_dir', false]],
        'system_config' => [['value', false], ['value', true]],
        'system_group_data' => [['value', true]],
        'theme' => [
            ['home_data', true], ['detail_data', true], ['user_data', true],
            ['home_default_data', true], ['detail_default_data', true], ['user_default_data', true],
            ['home_data', false], ['detail_data', false], ['user_data', false],
            ['home_default_data', false], ['detail_default_data', false], ['user_default_data', false],
            ['home_image', false], ['category_image', false], ['detail_image', false], ['user_image', false],
            ['home_default_image', false], ['category_default_image', false], ['detail_default_image', false],
            ['user_default_image', false],
        ],
        'user' => [['avatar', false]],
        'wechat_qrcode' => [['image', false]],
        'wechat_user' => [['headimgurl', false]],
    ];

    /**
     * 表名前缀
     * @return string
     */
    protected function prefix(): string
    {
        return (string)Config::get('database.connections.' . Config::get('database.default') . '.prefix');
    }

    /**
     * 数据表是否存在
     * @param string $table
     * @return bool
     */
    protected function tableExists(string $table): bool
    {
        if (!preg_match('/^[a-z0-9_]+$/', $table)) return false;
        return (bool)Db::query("SHOW TABLES LIKE '" . $this->prefix() . $table . "'");
    }

    /**
     * 清除表数据。退出业务的表在迁移后已不存在，缺失的表跳过并在报告里列出，
     * 单个表失败不阻断其余表，最后统一报告结果。
     * @param string|array $table_name
     * @param bool $status true 使用 TRUNCATE，false 使用 DELETE
     * @return array{cleared: string[], missing: string[], failed: array<string, string>}
     */
    public function clearData($table_name, bool $status)
    {
        $prefix = $this->prefix();
        $clearData = is_string($table_name) ? [$table_name] : $table_name;
        $cleared = [];
        $missing = [];
        $failed = [];
        foreach ($clearData as $name) {
            if (!is_string($name) || !preg_match('/^[a-z0-9_]+$/', $name)) {
                $failed[(string)$name] = '表名不合法';
                continue;
            }
            if (!$this->tableExists($name)) {
                $missing[] = $name;
                continue;
            }
            try {
                if ($status) {
                    Db::execute('TRUNCATE TABLE `' . $prefix . $name . '`');
                } else {
                    Db::execute('DELETE FROM `' . $prefix . $name . '`');
                }
                $cleared[] = $name;
            } catch (\Throwable $e) {
                $failed[$name] = $e->getMessage();
            }
        }
        if ($failed) {
            $detail = [];
            foreach ($failed as $name => $message) {
                $detail[] = $name . '(' . $message . ')';
            }
            throw new AdminException('清除失败：{:msg}', ['msg' => implode('、', $detail)]);
        }
        return compact('cleared', 'missing', 'failed');
    }

    /**
     * 递归删除文件,只能删除 public/uploads下的文件
     * @param $dirName
     * @param bool $subdir
     */
    public function delDirAndFile(string $dirName, $subdir = true)
    {
        if (strstr($dirName, 'public/uploads') === false) {
            return true;
        }
        if ($handle = @opendir("$dirName")) {
            while (false !== ($item = readdir($handle))) {
                if ($item != "." && $item != "..") {
                    if (is_dir("$dirName/$item"))
                        $this->delDirAndFile("$dirName/$item", false);
                    else
                        @unlink("$dirName/$item");
                }
            }
            closedir($handle);
            if (!$subdir) @rmdir($dirName);
        }
    }

    /**
     * 替换域名
     * @param string $url 替换后的域名
     * @param string|null $from 替换前的域名，默认取站点配置
     * @return mixed
     */
    public function replaceSiteUrl(string $url, ?string $from = null)
    {
        // 获取站点 URL
        $siteUrl = $from !== null && $from !== '' ? $from : (string)sys_config('site_url');
        // 解析站点 URL 的协议
        $siteUrlScheme = parse_url($siteUrl)['scheme'];
        // 将站点 URL 中的协议替换为 JSON 格式
        $siteUrlJson = str_replace($siteUrlScheme . '://', $siteUrlScheme . ':\\\/\\\/', $siteUrl);

        // 获取当前 URL 的协议
        $urlScheme = parse_url($url)['scheme'];
        // 将当前 URL 中的协议替换为 JSON 格式
        $urlJson = str_replace($urlScheme . '://', $urlScheme . ':\\\/\\\/', $url);
        // 获取数据库表前缀
        $prefix = $this->prefix();

        // 构建 SQL 语句数组；退出业务的表已从数据库中删除，只保留仍在用的表
        $sql = [];
        $missing = [];
        foreach ($this->siteUrlColumns as $table => $columns) {
            if (!$this->tableExists($table)) {
                $missing[] = $table;
                continue;
            }
            foreach ($columns as [$column, $escaped]) {
                $search = $escaped ? $siteUrlJson : $siteUrl;
                $replace = $escaped ? $urlJson : $url;
                $sql[] = "UPDATE `{$prefix}{$table}` SET `{$column}` = replace(`{$column}`,'{$search}','{$replace}')";
            }
        }
        if ($missing) {
            Log::info('替换域名跳过的表：' . implode('、', $missing));
        }

        // 执行 SQL 语句
        return $this->transaction(function () use ($sql) {
            try {
                foreach ($sql as $item) {
                    Db::execute($item);
                }
            } catch (\Throwable $e) {
                throw new AdminException('替换失败,失败原因:{:msg}', ['msg' => $e->getMessage()]);
            }
        });
    }
}
