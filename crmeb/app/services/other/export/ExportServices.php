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

namespace app\services\other\export;

use app\services\activity\bargain\StoreBargainServices;
use app\services\activity\combination\StoreCombinationServices;
use app\services\activity\seckill\StoreSeckillServices;
use app\services\BaseServices;
use app\services\order\StoreOrderServices;
use app\services\product\product\StoreCategoryServices;
use app\services\product\product\StoreDescriptionServices;
use app\services\product\product\StoreProductServices;
use app\services\product\sku\StoreProductAttrResultServices;
use app\services\user\member\MemberCardServices;
use app\services\user\UserServices;
use crmeb\services\SpreadsheetExcelService;

class ExportServices extends BaseServices
{
    /**
     * 用户导出
     * @param $where
     * @return array
     */
    public function exportUserList($where)
    {
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $data = $userServices->index($where)['list'];
        $header = ['用户ID', '昵称', '真实姓名', '性别', '电话', '用户分组', '用户标签', '用户类型', '最后登录时间', '注册时间', '是否注销'];
        $filename = '用户列表_' . date('YmdHis', time());
        $export = $fileKey = [];
        if (!empty($data)) {
            $i = 0;
            foreach ($data as $item) {
                $one_data = [
                    'uid' => $item['uid'],
                    'nickname' => $item['nickname'],
                    'real_name' => $item['real_name'],
                    'sex' => $item['sex'],
                    'phone' => $item['phone'],
                    'group_id' => $item['group_id'],
                    'labels' => $item['labels'],
                    'user_type' => $item['user_type'],
                    'last_time' => date('Y-m-d H:i:s', $item['last_time']),
                    'add_time' => date('Y-m-d H:i:s', $item['add_time']),
                    'is_del' => $item['is_del'] ? '已注销' : '正常'
                ];
                $export[] = $one_data;
                if ($i == 0) {
                    $fileKey = array_keys($one_data);
                }
                $i++;
            }
        }
        return compact('header', 'fileKey', 'export', 'filename');
    }

    /**
     * 订单导出
     * @param $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function exportOrderList($where)
    {
        $header = ['订单号', '收货人姓名', '收货人电话', '收货地址', '商品名称', '规格', '数量', '价格', '总价格', '实际支付', '支付状态', '支付时间', '订单状态', '下单时间', '用户备注', '商家备注', '表单信息'];
        $filename = '订单列表_' . date('YmdHis', time());
        $export = $fileKey = [];
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $data = $orderServices->getOrderList($where)['data'];
        if (!empty($data)) {
            $i = 0;
            foreach ($data as $item) {
                if ($item['paid'] == 1) {
                    $item['pay_type_name'] = \app\services\CoreStore::historicalPayTypeLabel($item['pay_type']);
                } else {
                    $item['pay_type_name'] = '未支付';
                }
                if ($item['paid'] == 0 && $item['status'] == 0) {
                    $item['status_name'] = '未支付';
                } else if ($item['paid'] == 1 && $item['status'] == 0 && $item['shipping_type'] == 1 && $item['refund_status'] == 0) {
                    $item['status_name'] = '未发货';
                } else if ($item['paid'] == 1 && $item['status'] == 1 && $item['shipping_type'] == 1 && $item['refund_status'] == 0) {
                    $item['status_name'] = '待收货';
                } else if ($item['paid'] == 1 && $item['status'] == 2 && $item['refund_status'] == 0) {
                    $item['status_name'] = '待评价';
                } else if ($item['paid'] == 1 && $item['status'] == 3 && $item['refund_status'] == 0) {
                    $item['status_name'] = '已完成';
                } else if ($item['paid'] == 1 && $item['refund_status'] == 1) {
                    $item['status_name'] = '正在退款';
                } else if ($item['paid'] == 1 && $item['refund_status'] == 2) {
                    $item['status_name'] = '已退款';
                }
                $custom_form = '';
                foreach ($item['custom_form'] as $custom_form_value) {
                    if (is_string($custom_form_value['value'])) {
                        $custom_form .= $custom_form_value['title'] . '：' . $custom_form_value['value'] . '；';
                    } elseif (is_array($custom_form_value['value'])) {
                        $custom_form .= $custom_form_value['title'] . '：' . implode(',', $custom_form_value['value']) . '；';
                    }
                }

//                $goodsName = [];
//                foreach ($item['_info'] as $value) {
//                    $_info = $value['cart_info'];
//                    $sku = '';
//                    if (isset($_info['productInfo']['attrInfo'])) {
//                        if (isset($_info['productInfo']['attrInfo']['suk'])) {
//                            $sku = '(' . $_info['productInfo']['attrInfo']['suk'] . ')';
//                        }
//                    }
//                    if (isset($_info['productInfo']['store_name'])) {
//                        $goodsName[] = implode(' ',
//                            [$_info['productInfo']['store_name'],
//                                $sku,
//                                "[{$_info['cart_num']} * {$_info['truePrice']}]"
//                            ]);
//                    }
//                }
//                $one_data = [
//                    'order_id' => $item['order_id'],
//                    'real_name' => $item['real_name'],
//                    'user_phone' => $item['user_phone'],
//                    'user_address' => $item['user_address'],
//                    'goods_name' => $goodsName ? implode("\n", $goodsName) : '',
//                    'total_price' => $item['total_price'],
//                    'pay_price' => $item['pay_price'],
//                    'pay_type_name' => $item['pay_type_name'],
//                    'pay_time' => $item['pay_time'] > 0 ? date('Y-m-d H:i', (int)$item['pay_time']) : '暂无',
//                    'status_name' => $item['status_name'] ?? '未知状态',
//                    'add_time' => $item['add_time'],
//                    'mark' => $item['mark'],
//                    'remark' => $item['remark'],
//                    'custom_form' => $custom_form,
//                ];
                $goodsInfo = [];
                foreach ($item['_info'] as $value) {
                    $goodsInfo[] = [
                        $value['cart_info']['productInfo']['store_name'],
                        $value['cart_info']['productInfo']['attrInfo']['suk'],
                        $value['cart_info']['cart_num'],
                        $value['cart_info']['truePrice'],
                    ];
                }
                $one_data = [
                    $item['order_id'],
                    $item['real_name'],
                    $item['user_phone'],
                    $item['user_address'],
                    $goodsInfo,
                    $item['total_price'],
                    $item['pay_price'],
                    $item['pay_type_name'],
                    $item['pay_time'] > 0 ? date('Y-m-d H:i', (int)$item['pay_time']) : '暂无',
                    $item['status_name'] ?? '未知状态',
                    $item['add_time'],
                    $item['mark'],
                    $item['remark'],
                    $custom_form,
                ];
                $export[] = $one_data;
                if ($i == 0) {
                    $fileKey = array_keys($one_data);
                }
                $i++;
            }
        }
        return compact('header', 'fileKey', 'export', 'filename');
    }

    /**
     * 订单导出
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function exportOrderDeliveryList()
    {
        $header = ['订单ID', '订单号', '快递名称', '快递编码', '快递单号', '收货人姓名', '收货人电话', '收货地址', '商品信息', '实际支付', '用户备注'];
        $filename = '发货单_' . date('YmdHis', time());
        $export = $fileKey = [];
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $data = $orderServices->getOrderList(['status' => 1, 'shipping_type' => 1, 'virtual_type' => 0, 'pid' => 0])['data'];
        if (!empty($data)) {
            $i = 0;
            foreach ($data as $item) {
                $goodsName = [];
                foreach ($item['_info'] as $value) {
                    $_info = $value['cart_info'];
                    $sku = '';
                    if (isset($_info['productInfo']['attrInfo'])) {
                        if (isset($_info['productInfo']['attrInfo']['suk'])) {
                            $sku = '(' . $_info['productInfo']['attrInfo']['suk'] . ')';
                        }
                    }
                    if (isset($_info['productInfo']['store_name'])) {
                        $goodsName[] = implode(' ',
                            [$_info['productInfo']['store_name'],
                                $sku,
                                "[{$_info['cart_num']} * {$_info['truePrice']}]"
                            ]);
                    }
                }
                $one_data = [
                    'id' => $item['id'],
                    'order_id' => $item['order_id'],
                    'delivery_name' => '',
                    'delivery_code' => '',
                    'delivery_id' => '',
                    'real_name' => $item['real_name'],
                    'user_phone' => $item['user_phone'],
                    'user_address' => $item['user_address'],
                    'goods_name' => $goodsName ? implode("\n", $goodsName) : '',
                    'pay_price' => $item['pay_price'],
                    'mark' => $item['mark'],
                ];
                $export[] = $one_data;
                if ($i == 0) {
                    $fileKey = array_keys($one_data);
                }
                $i++;
            }
        }
        return compact('header', 'fileKey', 'export', 'filename');
    }

    /**
     * 商品导出
     * @param $where
     * @return array
     */
    public function exportProductList($where)
    {
        /** @var StoreProductServices $productServices */
        $productServices = app()->make(StoreProductServices::class);
        [$page, $limit] = $this->getPageValue();
        $cateIds = [];
        if (isset($where['cate_id']) && $where['cate_id']) {
            /** @var StoreCategoryServices $storeCategory */
            $storeCategory = app()->make(StoreCategoryServices::class);
            $cateIds = $storeCategory->getColumn(['pid' => (int)$where['cate_id']], 'id');
        }
        if ($cateIds) {
            $cateIds[] = $where['cate_id'];
            $where['cate_id'] = $cateIds;
        }
        $productList = $productServices->dao->getList($where, $page, $limit);
        $header = [
            '商品编号',
            '商品名称', '商品类型', '商品分类(一级)', '商品分类(二级)', '商品单位',
            '已售数量', '起购数量',
            '规格类型', '规格名称', '售价', '划线价', '成本价', '库存', '重量', '体积', '商品编码', '条形码',
            '商品简介', '商品关键字', '商品口令'
        ];
        $filename = '商品导出_' . date('YmdHis', time());
        $virtualType = ['普通商品', '卡密/网盘', '优惠券', '虚拟商品'];
        $export = $fileKey = [];
        if (!empty($productList)) {
            $productList = array_column($productList, null, 'id');
            $productIds = array_column($productList, 'id');
            $descriptionArr = app()->make(StoreDescriptionServices::class)->getColumn([['product_id', 'in', $productIds], ['type', '=', 0]], 'description', 'product_id');
            $cateIds = implode(',', array_column($productList, 'cate_id'));
            /** @var StoreCategoryServices $categoryService */
            $categoryService = app()->make(StoreCategoryServices::class);
            $cateList = $categoryService->getCateParentAndChildName($cateIds);
            $attrResultArr = app()->make(StoreProductAttrResultServices::class)->getColumn([['product_id', 'in', $productIds], ['type', '=', 0]], 'result', 'product_id');
            $i = 0;
            foreach ($attrResultArr as $product_id => &$attrResult) {
                $attrResult = json_decode($attrResult, true);
                foreach ($attrResult['value'] as &$value) {
                    $productInfo = $productList[$product_id];
                    $cateName = array_filter($cateList, function ($val) use ($productInfo) {
                        if (in_array($val['id'], explode(',', $productInfo['cate_id']))) {
                            return $val;
                        }
                    });
                    $skuArr = array_combine(array_column($attrResult['attr'], 'value'), $value['detail']);
                    $attrArr = [];
                    foreach ($attrResult['attr'] as $attrArray) {
                        // 将每个子数组的 'value' 和 'detail' 组合成字符串
                        if (isset($attrArray['detail'][0]['value'])) {
                            $attrArray['detail'] = array_column($attrArray['detail'], 'value');
                        }
                        $detailString = implode(',', $attrArray['detail']); // 将 detail 数组转换为逗号分隔的字符串
                        $attrArr[] = $attrArray['value'] . '=' . $detailString;
                    }
                    $attrString = implode(';', $attrArr);
                    if (reset($cateName)['one'] == null) {
                        $cate_name_one = reset($cateName)['two'] ?? '';
                        $cate_name_two = '';
                    } else {
                        $cate_name_one = reset($cateName)['one'] ?? '';
                        $cate_name_two = reset($cateName)['two'] ?? '';
                    }
                    $one_data = [
                        'id' => intval($product_id),
                        'store_name' => $productInfo['store_name'],
                        'virtual_type' => $virtualType[$productInfo['virtual_type']],
                        'cate_name_one' => $cate_name_one,
                        'cate_name_two' => $cate_name_two,
                        'unit_name' => $productInfo['unit_name'],
                        'ficti' => intval($productInfo['ficti']),
                        'min_qty' => intval($productInfo['min_qty']),
                        'spec_type' => intval($productInfo['spec_type']) == 1 ? '多规格' : '单规格',
                        'sku_name' => implode(',', $value['detail']),
                        'price' => floatval($value['price']),
                        'ot_price' => floatval($value['ot_price']),
                        'cost' => floatval($value['cost']),
                        'stock' => intval($value['stock']),
                        'weight' => intval($value['weight'] ?? 0),
                        'volume' => intval($value['volume'] ?? 0),
                        'bar_code' => $value['bar_code'] ?? '',
                        'bar_code_number' => $value['bar_code_number'] ?? '',
                        'store_info' => $productInfo['store_info'],
                        'keyword' => $productInfo['keyword'],
                        'command_word' => $productInfo['command_word'],
                    ];
                    $export[] = $one_data;
                    if ($i == 0) {
                        $fileKey = array_keys($one_data);
                    }
                    $i++;
                }
            }
        }
        return compact('header', 'fileKey', 'export', 'filename');
    }

    /**
     * 拼团商品导出
     * @param $where
     * @return array
     */
    public function exportCombinationList($where)
    {
        $header = ['拼团名称', '拼团价', '原价', '拼团人数', '参与人数', '成团数量', '剩余库存', '活动状态', '活动时间', '添加时间'];
        $filename = '拼团列表_' . date('YmdHis', time());
        $export = $fileKey = [];
        /** @var StoreCombinationServices $combinationServices */
        $combinationServices = app()->make(StoreCombinationServices::class);
        $data = $combinationServices->systemPage($where)['list'];
        if (!empty($data)) {
            $i = 0;
            foreach ($data as $item) {
                $one_data = [
                    'title' => $item['title'],
                    'price' => $item['price'],
                    'ot_price' => $item['ot_price'],
                    'count_people' => $item['count_people'],
                    'count_people_all' => $item['count_people_all'],
                    'count_people_pink' => $item['count_people_pink'],
                    'quota' => $item['quota'],
                    'start_name' => $item['start_name'],
                    'activity_time' => $item['start_time'] . '至' . $item['stop_time'],
                    'add_time' => $item['add_time']
                ];
                $export[] = $one_data;
                if ($i == 0) {
                    $fileKey = array_keys($one_data);
                }
                $i++;
            }
        }
        return compact('header', 'fileKey', 'export', 'filename');
    }

    /**
     * 真实请求导出
     * @param $header excel表头
     * @param $title 标题
     * @param array $export 填充数据
     * @param string $filename 保存文件名称
     * @param string $suffix 保存文件后缀
     * @param bool $is_save true|false 是否保存到本地
     * @return mixed
     */
    public function export($header, $title_arr, $export = [], $filename = '', $suffix = 'xlsx', $is_save = false)
    {
        $title = isset($title_arr[0]) && !empty($title_arr[0]) ? $title_arr[0] : '导出数据';
        $name = isset($title_arr[1]) && !empty($title_arr[1]) ? $title_arr[1] : '导出数据';
        $info = isset($title_arr[2]) && !empty($title_arr[2]) ? $title_arr[2] : date('Y-m-d H:i:s', time());

        $path = SpreadsheetExcelService::instance()->setExcelHeader($header)
            ->setExcelTile($title, $name, $info)
            ->setExcelContent($export)
            ->excelSave($filename, $suffix, $is_save);
        $path = $this->siteUrl() . $path;
        return [$path];
    }

    /**
     * 获取系统接口域名
     * @return string
     */
    public function siteUrl()
    {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? "https://" : "http://";
        $domainName = $_SERVER['HTTP_HOST'];
        return $protocol . $domainName;
    }


    /**
     * 用户资金导出
     * @param $data 导出数据
     */
    public function userFinance($data = [])
    {
        $export = [];
        if (!empty($data)) {
            foreach ($data as $value) {
                $export[] = [
                    $value['uid'],
                    $value['nickname'],
                    $value['pm'] == 0 ? '-' . $value['number'] : $value['number'],
                    $value['title'],
                    $value['mark'],
                    $value['add_time'],
                ];
            }
        }
        $header = ['会员ID', '昵称', '金额/积分', '类型', '备注', '创建时间'];
        $title = ['资金监控', '资金监控', date('Y-m-d H:i:s', time())];
        $filename = '资金监控_' . date('YmdHis', time());
        $suffix = 'xlsx';
        $is_save = true;
        return $this->export($header, $title, $export, $filename, $suffix, $is_save);
    }

    /**
     * 商铺拼团导出
     * @param $data 导出数据
     */
    public function storeCombination($data = [])
    {
        $export = [];
        if (!empty($data)) {
            foreach ($data as $item) {
                $export[] = [
                    $item['id'],
                    $item['title'],
                    $item['ot_price'],
                    $item['price'],
                    $item['quota'],
                    $item['count_people'],
                    $item['count_people_all'],
                    $item['count_people_pink'],
                    $item['sales'] ?? 0,
                    $item['is_show'] ? '开启' : '关闭',
                    empty($item['stop_time']) ? '' : date('Y/m/d H:i:s', (int)$item['stop_time'])
                ];
            }
        }
        $header = ['编号', '拼团名称', '原价', '拼团价', '限量', '拼团人数', '参与人数', '成团数量', '销量', '商品状态', '结束时间'];
        $title = ['拼团商品导出', '商品信息' . time(), ' 生成时间：' . date('Y-m-d H:i:s', time())];
        $filename = '拼团商品导出_' . date('YmdHis', time());
        $suffix = 'xlsx';
        $is_save = true;
        return $this->export($header, $title, $export, $filename, $suffix, $is_save);
    }

    public function tradeData($data = [], $tradeTitle = "交易统计")
    {
        $export = $header = [];
        if (!empty($data)) {
            $header = ['时间'];
            $headerArray = array_column($data['series'], 'name');
            $header = array_merge($header, $headerArray);
            $export = [];
            foreach ($data['series'] as $index => $item) {
                foreach ($data['x'] as $k => $v) {
                    $export[$v]['time'] = $v;
                    $export[$v][] = $item['value'][$k];
                }
            }
        }
        $title = [$tradeTitle, $tradeTitle, ' 生成时间：' . date('Y-m-d H:i:s', time())];
        $filename = $tradeTitle;
        $suffix = 'xlsx';
        $is_save = true;
        return $this->export($header, $title, $export, $filename, $suffix, $is_save);
    }


    /**
     * 商品统计
     * @param $data 导出数据
     */
    public function productTrade($data = [])
    {
        $export = [];
        if (!empty($data)) {
            foreach ($data as &$value) {
                $export[] = [
                    $value['time'],
                    $value['browse'],
                    $value['user'],
                    $value['cart'],
                    $value['order'],
                    $value['payNum'],
                    $value['pay'],
                    $value['cost'],
                    $value['refund'],
                    $value['refundNum'],
                    $value['changes'] . '%'
                ];
            }
        }
        $header = ['日期/时间', '商品浏览量', '商品访客数', '加购件数', '下单件数', '支付件数', '支付金额', '成本金额', '退款金额', '退款件数', '访客-支付转化率'];
        $title = ['商品统计', '商品统计' . time(), ' 生成时间：' . date('Y-m-d H:i:s', time())];
        $filename = '商品统计_' . date('YmdHis', time());
        $suffix = 'xlsx';
        $is_save = true;
        return $this->export($header, $title, $export, $filename, $suffix, $is_save);
    }

    public function userTrade($data = [])
    {
        $export = [];
        if (!empty($data)) {
            foreach ($data as &$value) {
                $export[] = [
                    $value['time'],
                    $value['user'],
                    $value['browse'],
                    $value['new'],
                    $value['paid'],
                ];
            }
        }
        $header = ['日期/时间', '访客数', '浏览量', '新增用户数', '成交用户数'];
        $title = ['用户统计', '用户统计' . time(), ' 生成时间：' . date('Y-m-d H:i:s', time())];
        $filename = '用户统计_' . date('YmdHis', time());
        $suffix = 'xlsx';
        $is_save = true;
        return $this->export($header, $title, $export, $filename, $suffix, $is_save);
    }

}
