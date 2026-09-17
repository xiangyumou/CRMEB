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

namespace app\services\product\product;


use app\dao\product\product\StoreProductDao;
use app\Request;
use app\services\activity\combination\StoreCombinationServices;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\BaseServices;
use app\services\activity\coupon\StoreCouponIssueServices;
use app\services\order\StoreCartServices;
use app\services\order\StoreOrderServices;
use app\services\other\QrcodeServices;
use app\services\product\sku\StoreProductAttrResultServices;
use app\services\product\sku\StoreProductAttrServices;
use app\services\product\sku\StoreProductAttrValueServices;
use app\services\product\sku\StoreProductRuleServices;
use app\services\product\sku\StoreProductVirtualServices;
use app\services\shipping\ShippingTemplatesServices;
use app\services\user\UserLabelServices;
use app\services\user\UserSearchServices;
use app\services\user\UserServices;
use crmeb\exceptions\AdminException;
use app\jobs\ProductLogJob;
use app\jobs\ProductCopyJob;
use crmeb\exceptions\ApiException;
use crmeb\services\FileService;
use crmeb\services\GroupDataService;
use think\facade\Config;

/**
 * Class StoreProductService
 * @package app\services\product\product
 * @method getOne(array $where) 获取一条数据
 * @method update(int $id, array $data) 获取一条数据
 * @method delete($id, ?string $key = null) 删除数据
 * @method value($where, ?string $field = null) 获取字段
 * @method incStockDecSales(array $where, int $num, string $stock = 'stock', string $sales = 'sales') 加库存减销量
 * @method count(array $where) 获取指定条件下的数量
 * @method getColumn(array $where, string $field, string $key = '') 获取某个字段数组
 * @method getSearchList(array $where, int $page = 0, int $limit = 0, ?array $field = ['*']) 获取列表
 * @method get(int $id, array $field) 获取一条数据
 * @method getCid(int $page, int $limit) 获取一级分类ID
 * @method downAdvance() 预售商品自动到期下架
 */
class StoreProductServices extends BaseServices
{
    /**
     * @var StoreProductDao
     */
    protected $dao;

    protected $productType = ['普通商品', '卡密商品', '优惠券商品', '虚拟商品'];


    public function __construct(StoreProductDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 获取顶部标签
     * @param array $where
     * @return array[]
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/31
     */
    public function getHeader($where = [])
    {
        $where['cate_id'] = $where['cate_id'] != '' ? app()->make(StoreCategoryServices::class)->getColumn(['pid' => $where['cate_id']], 'id') : [];
        //出售中的商品
        $onsale = $this->dao->getCount($where + ['type' => 1]);
        //仓库中的商品
        $forsale = $this->dao->getCount($where + ['type' => 2]);
        //已经售罄商品
        $outofstock = $this->dao->getCount($where + ['type' => 4]);
        //警戒库存商品
        $policeforce = $this->dao->getCount($where + ['type' => 5, 'store_stock' => sys_config('store_stock') > 0 ? sys_config('store_stock') : 2]);
        //回收站的商品
        $recycle = $this->dao->getCount($where + ['type' => 6]);
        return [
            ['type' => 1, 'name' => '出售中的商品', 'count' => $onsale],
            ['type' => 2, 'name' => '仓库中的商品', 'count' => $forsale],
            ['type' => 4, 'name' => '已经售罄商品', 'count' => $outofstock],
            ['type' => 5, 'name' => '警戒库存商品', 'count' => $policeforce],
            ['type' => 6, 'name' => '回收站的商品', 'count' => $recycle]
        ];
    }

    /**
     * 获取列表
     * @param array $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/02/17
     */
    public function getList(array $where)
    {
        $where['store_stock'] = sys_config('store_stock') > 0 ? sys_config('store_stock') : 2;
        [$page, $limit] = $this->getPageValue();
        $cateIds = [];
        if (isset($where['cate_id']) && $where['cate_id']) {
            /** @var StoreCategoryServices $storeCategory */
            $storeCategory = app()->make(StoreCategoryServices::class);
            $cateIds = $storeCategory->getColumn(['pid' => $where['cate_id']], 'id');
        }
        if ($cateIds) {
            $cateIds[] = $where['cate_id'];
            $where['cate_id'] = $cateIds;
        }
        $order_string = '';
        $order_arr = ['asc', 'desc'];
        if (isset($where['sales']) && in_array($where['sales'], $order_arr)) {
            $order_string = 'sales ' . $where['sales'];
        }
        unset($where['sales']);
        $list = $this->dao->getList($where, $page, $limit, $order_string);
        $cateIds = implode(',', array_column($list, 'cate_id'));
        /** @var StoreCategoryServices $categoryService */
        $categoryService = app()->make(StoreCategoryServices::class);
        $cateList = $categoryService->getCateParentAndChildName($cateIds);
        $oneCateList = $categoryService->getColumn(['pid' => 0], 'id');
        $parentCateList = $categoryService->getColumn([
            ['id', 'in', $cateIds]
        ], 'cate_name', 'id');
        $activityExist = $this->getActivityExist(array_column($list, 'id'));
        $proIds = array_column(array_filter($list, function ($item) {
            return $item['spec_type'] == 0;
        }), 'id', 'id');
        /** @var StoreProductAttrValueServices $storeProductAttrValueServices */
        $storeProductAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        $attrValueList = $storeProductAttrValueServices->getSkuArray(['product_id' => $proIds, 'type' => 0], 'unique,cost,price,ot_price,stock,product_id', 'product_id');
        foreach ($list as &$item) {
            if ($item['spec_type'] == 0) {
                $item['attr_value'] = $attrValueList[$item['id']] ?? [];
            }
            $cateName = array_filter($cateList, function ($val) use ($item) {
                if (in_array($val['id'], explode(',', $item['cate_id']))) {
                    return $val;
                }
            });
            $item['cate_name'] = [];
            foreach ($cateName as $k => $v) {
                $item['cate_name'][] = $v['one'] . '/' . $v['two'];
            }
            foreach (explode(',', $item['cate_id']) as $cate_value) {
                if (in_array($cate_value, $oneCateList)) $item['cate_name'][] = $parentCateList[$cate_value];
            }
            $item['cate_name'] = is_array($item['cate_name']) ? implode(',', $item['cate_name']) : '';
            $item['stock_attr'] = $item['stock'] > 0; //库存
            $item['product_type'] = $this->productType[$item['virtual_type']];
            $item['image'] = set_file_url($item['image']);
            $item['slider_image'] = set_file_url($item['slider_image']);
            $item['activityExist'] = $activityExist[$item['id']];
        }
        $count = $this->dao->count($where);
        return compact('list', 'count');
    }

    public function getActivityExist($productIds)
    {
        if (!count($productIds)) return [];
        $combination = app()->make(StoreCombinationServices::class)->getProductExist($productIds);
        $activityExist = [];
        foreach ($productIds as $productId) {
            $activityExist[$productId]['combination'] = false;
            foreach ($combination as $key3 => $item3) {
                if ($productId == $key3) {
                    $activityExist[$productId]['combination'] = true;
                }
            }
        }
        return $activityExist;
    }

    /**
     * 设置商品上下架
     * @param $ids
     * @param $is_show
     */
    public function setShow(array $ids, int $is_show)
    {
        if (empty($ids)) throw new AdminException('参数错误');
//        if ($is_show == 0) {
//            //下架检测是否有参与活动商品
//            $this->checkActivity($ids);
//        }
        /** @var StoreCartServices $cartService */
        $cartService = app()->make(StoreCartServices::class);
        foreach ($ids as $id) {
            $cartService->changeStatus($id, $is_show);
        }
        $res = $this->dao->batchUpdate($ids, ['is_show' => $is_show]);
        /** @var StoreProductCateServices $storeProductCateServices */
        $storeProductCateServices = app()->make(StoreProductCateServices::class);
        $storeProductCateServices->batchUpdate($ids, ['status' => $is_show], 'product_id');
        return true;
    }

    /**
     * 获取规格模板
     * @return array
     */
    public function getRule()
    {
        /** @var StoreProductRuleServices $storeProductRuleServices */
        $storeProductRuleServices = app()->make(StoreProductRuleServices::class);
        $list = $storeProductRuleServices->getList()['list'];
        foreach ($list as &$item) {
            $item['rule_value'] = json_decode($item['rule_value'], true);
            foreach ($item['rule_value'] as $ruleKey => $ruleItem) {
                foreach ($ruleItem['detail'] as $valueKey => $valueItem) {
                    if (is_string($valueItem)) {
                        $item['rule_value'][$ruleKey]['detail'][$valueKey] = ['value' => $valueItem, 'pic' => ''];
                        $item['rule_value'][$ruleKey]['add_pic'] = 0;
                    }
                }
            }
        }
        return $list;
    }

    /**
     * 获取商品详情
     * @param int $id
     * @return array|\think\Model|null
     */
    public function getInfo(int $id)
    {
        /** @var StoreCategoryServices $storeCatecoryService */
        $storeCatecoryService = app()->make(StoreCategoryServices::class);
        /** @var StoreDescriptionServices $storeDescriptionServices */
        $storeDescriptionServices = app()->make(StoreDescriptionServices::class);
        /** @var StoreProductAttrResultServices $storeProductAttrResultServices */
        $storeProductAttrResultServices = app()->make(StoreProductAttrResultServices::class);
        /** @var StoreProductAttrValueServices $storeProductAttrValueServices */
        $storeProductAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        /** @var StoreProductCouponServices $storeProductCouponServices */
        $storeProductCouponServices = app()->make(StoreProductCouponServices::class);
        /** @var StoreCouponIssueServices $storeCouponIssueServices */
        $storeCouponIssueServices = app()->make(StoreCouponIssueServices::class);
        /** @var UserLabelServices $userLabelServices */
        $userLabelServices = app()->make(UserLabelServices::class);
        $data['tempList'] = $this->getTemp();
        $menus = [];
        foreach ($storeCatecoryService->getTierList(1) as $menu) {
            $menus[] = ['value' => $menu['id'], 'label' => $menu['html'] . $menu['cate_name'], 'disabled' => $menu['pid'] == 0 ? 0 : 1]; //,'disabled'=>$menu['pid']== 0];
        }
        $data['cateList'] = $menus;
        $productInfo = $this->dao->getInfo($id);
        if ($productInfo) $productInfo = $productInfo->toArray();
        else throw new AdminException('商品不存在');
        $couponIds = array_column($productInfo['coupons'], 'issue_coupon_id');
        $is_sub = $recommend = [];
        if ($productInfo['is_sub'] == 1) array_push($is_sub, 1);
        if ($productInfo['is_hot'] == 1) array_push($recommend, 'is_hot');
        if ($productInfo['is_benefit'] == 1) array_push($recommend, 'is_benefit');
        if ($productInfo['is_new'] == 1) array_push($recommend, 'is_new');
        if ($productInfo['is_good'] == 1) array_push($recommend, 'is_good');
        if ($productInfo['is_best'] == 1) array_push($recommend, 'is_best');
        if (isset($productInfo['logistics']) && $productInfo['logistics'] != '') $productInfo['logistics'] = explode(',', $productInfo['logistics']);
        $productInfo['is_sub'] = $is_sub;
        $productInfo['recommend'] = $recommend;
        $recommend_list = [];
        if ($productInfo['recommend_list'] != '') {
            $productInfo['recommend_list'] = explode(',', $productInfo['recommend_list']);
            if (count($productInfo['recommend_list'])) {
                $images = $this->getColumn([['id', 'in', $productInfo['recommend_list']]], 'image', 'id');
                foreach ($productInfo['recommend_list'] as $item) {
                    $recommend_list[] = [
                        'product_id' => $item,
                        'image' => $images[$item]
                    ];
                }
            }
        }
        $productInfo['video_open'] = $productInfo['video_link'] != '' ? 1 : 0;
        if (!empty($productInfo['video_link']) && (strpos($productInfo['video_link'], 'http') !== false)) {
            $productInfo['seletVideo'] = 1;
        } else {
            $productInfo['seletVideo'] = 0;
        }
        $productInfo['video_link'] = empty($productInfo['video_link']) ? '' : (strpos($productInfo['video_link'], 'http') === false ? sys_config('site_url') . $productInfo['video_link'] : $productInfo['video_link']);
        $productInfo['recommend_list'] = $recommend_list;
        $productInfo['coupons'] = $storeCouponIssueServices->productCouponList([['id', 'in', $couponIds]], 'title,id');
        $productInfo['cate_id'] = explode(',', $productInfo['cate_id']);
        $label_id = explode(',', $productInfo['label_id']);
        $productInfo['label_id'] = $userLabelServices->getLabelList(['ids' => $label_id], ['id', 'label_name']);
        $productInfo['presale_time'] = $productInfo['presale_start_time'] == 0 ? [] : [date('Y-m-d H:i:s', $productInfo['presale_start_time']), date('Y-m-d H:i:s', $productInfo['presale_end_time'])];
        $productInfo['description'] = $storeDescriptionServices->getDescription(['product_id' => $id, 'type' => 0]);
        $productInfo['custom_form'] = json_decode($productInfo['custom_form'], true);
        $productInfo['params_list'] = json_decode($productInfo['params_list'], true) ?? [];
        $productInfo['label_list'] = $productInfo['label_list'] != '' ? array_map('intval', explode(',', $productInfo['label_list'])) : [];
        $productInfo['protection_list'] = $productInfo['protection_list'] != '' ? array_map('intval', explode(',', $productInfo['protection_list'])) : [];
        /** @var StoreProductAttrServices $storeProductAttrServices */
        $storeProductAttrServices = app()->make(StoreProductAttrServices::class);
        //无属性添加默认属性
        if (!$storeProductAttrResultServices->getResult(['product_id' => $id, 'type' => 0])) {
            $attr = [
                [
                    'value' => '规格',
                    'detailValue' => '',
                    'attrHidden' => '',
                    'detail' => ['默认']
                ]
            ];
            $detail[0] = [
                'attr_arr' => ['默认'],
                'value1' => '默认',
                'detail' => ['规格' => '默认'],
                'pic' => $productInfo['image'],
                'price' => $productInfo['price'],
                'cost' => $productInfo['cost'],
                'ot_price' => $productInfo['ot_price'],
                'stock' => $productInfo['stock'],
                'bar_code' => '',
                'bar_code_number' => '',
                'weight' => 0,
                'volume' => 0,
            ];
            $skuList = $this->validateProductAttr($attr, $detail, $id, 0, 1, true);
            $storeProductAttrServices->saveProductAttr($skuList, $id, 0);
            $this->dao->update($id, ['spec_type' => 0]);
        }
        if ($productInfo['spec_type'] == 1) {
            $result = $storeProductAttrResultServices->getResult(['product_id' => $id, 'type' => 0]);
            $attrInfo = $storeProductAttrValueServices->getColumn(['product_id' => $id, 'type' => 0]);
            foreach ($result['value'] as $k => $v) {
                if (!isset($v['is_show'])) {
                    $result['value'][$k]['is_show'] = 1;
                }
                $num = 1;
                foreach ($v['detail'] as $dv) {
                    $result['value'][$k]['value' . $num] = $dv;
                    $num++;
                }
                if (!isset($v['attr_arr'])) {
                    $result['value'][$k]['attr_arr'] = array_values($v['detail']);
                    foreach ($v['detail'] as $detailKey => $detailValue) {
                        $result['value'][$k][$detailKey] = $detailValue;
                    }
                }
                foreach ($attrInfo as $attrKey => $attrItem) {
                    if (implode(',', $result['value'][$k]['attr_arr']) == $attrKey) {
                        $result['value'][$k]['unique'] = $attrItem['unique'];
                        $result['value'][$k]['stock'] = $attrItem['stock'];
                        $result['value'][$k]['price'] = $attrItem['price'];
                        $result['value'][$k]['cost'] = $attrItem['cost'];
                        $result['value'][$k]['ot_price'] = $attrItem['ot_price'];
                    }
                }
            }
            foreach ($result['attr'] as $attrKey => $attrItem) {
                foreach ($attrItem['detail'] as $valueKey => $valueItem) {
                    if (is_string($valueItem)) {
                        $result['attr'][$attrKey]['detail'][$valueKey] = ['value' => $valueItem, 'pic' => ''];
                        $result['attr'][$attrKey]['add_pic'] = 0;
                    }
                }
            }
            $productInfo['items'] = $result['attr'];
            $productInfo['attrs'] = $result['value'];
            $productInfo['attr'] = ['pic' => '', 'price' => 0, 'cost' => 0, 'ot_price' => 0, 'stock' => 0, 'bar_code' => '', 'bar_code_number' => '', 'weight' => 0, 'volume' => 0];
        } else {
            /** @var StoreProductVirtualServices $virtualService */
            $virtualService = app()->make(StoreProductVirtualServices::class);
            $result = $storeProductAttrValueServices->getOne(['product_id' => $id, 'type' => 0]);
            $productInfo['items'] = [];
            $productInfo['attrs'] = [];
            $productInfo['attr'] = [
                'pic' => $result['image'] ?? '',
                'price' => $result['price'] ? floatval($result['price']) : 0,
                'cost' => $result['cost'] ? floatval($result['cost']) : 0,
                'ot_price' => $result['ot_price'] ? floatval($result['ot_price']) : 0,
                'stock' => $result['stock'] ? floatval($result['stock']) : 0,
                'bar_code' => $result['bar_code'] ?? '',
                'bar_code_number' => $result['bar_code_number'] ?? '',
                'virtual_list' => $virtualService->getArr($result['unique'], $id),
                'weight' => $result['weight'] ? floatval($result['weight']) : 0,
                'volume' => $result['volume'] ? floatval($result['volume']) : 0,
                'coupon_id' => $result['coupon_id'],
                'coupon_name' => $storeCouponIssueServices->value(['id' => $result['coupon_id']], 'title'),
                'disk_info' => $result['disk_info'],
                'unique' => $result['unique'],
            ];
        }
        if ($productInfo['activity']) {
            $activity = explode(',', $productInfo['activity']);
            foreach ($activity as $k => $v) {
                if ($v == 1) {
                } elseif ($v == 2) {
                } elseif ($v == 3) {
                    $activity[$k] = '拼团';
                } elseif ($v == 0) {
                    $activity[$k] = '默认';
                }
            }
            $productInfo['activity'] = $activity;
        } else {
            $productInfo['activity'] = ['默认', '拼团'];
        }
        $data['productInfo'] = $productInfo;
        return $data;
    }

    /**
     * 获取运费模板列表
     * @return array
     */
    public function getTemp()
    {
        /** @var ShippingTemplatesServices $shippingTemplatesServices */
        $shippingTemplatesServices = app()->make(ShippingTemplatesServices::class);
        return $shippingTemplatesServices->getSelectList();
    }

    /**
     * 获取商品规格
     * @param array $data
     * @param int $id
     * @param int $type
     * @return array
     */
    public function getAttr(array $data, int $id, int $type)
    {
        /** @var StoreProductAttrValueServices $storeProductAttrValueServices */
        $storeProductAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        /** @var StoreProductVirtualServices $virtualService */
        $virtualService = app()->make(StoreProductVirtualServices::class);
        /** @var StoreCouponIssueServices $storeCouponIssueServices */
        $storeCouponIssueServices = app()->make(StoreCouponIssueServices::class);
        $attr = $data['attrs'];
        $is_virtual = $data['is_virtual']; //是否虚拟商品
        $virtual_type = $data['virtual_type']; //虚拟商品类型
        $attr = array_merge($attr);
        list($value, $head) = attr_format($attr);
        $valueNew = [];
        $count = 0;

        foreach ($value as $suk) {
            $detail = explode(',', $suk);

            $types = 1;
            if ($id) {
                $sukValue = $storeProductAttrValueServices->getColumn(['product_id' => $id, 'type' => 0, 'suk' => $suk], 'bar_code,bar_code_number,cost,price,ot_price,stock,image as pic,weight,volume,is_virtual,coupon_id,unique,disk_info', 'suk');
                if (!$sukValue) {
                    if ($type == 0) $types = 0; //编辑商品时，将没有规格的数据不生成默认值
                    $sukValue[$suk]['pic'] = '';
                    $sukValue[$suk]['price'] = 0;
                    $sukValue[$suk]['cost'] = 0;
                    $sukValue[$suk]['ot_price'] = 0;
                    $sukValue[$suk]['stock'] = 0;
                    $sukValue[$suk]['bar_code'] = '';
                    $sukValue[$suk]['bar_code_number'] = '';
                    if ($is_virtual) {
                        if ($virtual_type == 1) {
                            $sukValue[$suk]['virtual_list'] = [];
                        } elseif ($virtual_type == 2) {
                            $sukValue[$suk]['coupon_id'] = 0;
                        }
                    }
                    $sukValue[$suk]['weight'] = 0;
                    $sukValue[$suk]['volume'] = 0;
                }
            } else {
                $sukValue[$suk]['pic'] = '';
                $sukValue[$suk]['price'] = 0;
                $sukValue[$suk]['cost'] = 0;
                $sukValue[$suk]['ot_price'] = 0;
                $sukValue[$suk]['stock'] = 0;
                $sukValue[$suk]['bar_code'] = '';
                $sukValue[$suk]['bar_code_number'] = '';
                if ($is_virtual) {
                    if ($virtual_type == 1) {
                        $sukValue[$suk]['virtual_list'] = [];
                    } elseif ($virtual_type == 2) {
                        $sukValue[$suk]['coupon_id'] = 0;
                    }
                }
                $sukValue[$suk]['weight'] = 0;
                $sukValue[$suk]['volume'] = 0;
            }
            if ($types) { //编辑商品时，将没有规格的数据不生成默认值
                foreach ($head as $k => $title) {
                    $header[$k]['title'] = $title;
                    $header[$k]['align'] = 'center';
                    $header[$k]['minWidth'] = 130;
                }
                foreach ($detail as $k => $v) {
                    $valueNew[$count]['value' . ($k + 1)] = $v;
                    $header[$k]['key'] = 'value' . ($k + 1);
                }
                $valueNew[$count]['detail'] = array_combine($head, $detail);
                $valueNew[$count]['pic'] = $sukValue[$suk]['pic'] ?? '';
                $valueNew[$count]['price'] = $sukValue[$suk]['price'] ? floatval($sukValue[$suk]['price']) : 0;
                $valueNew[$count]['cost'] = $sukValue[$suk]['cost'] ? floatval($sukValue[$suk]['cost']) : 0;
                $valueNew[$count]['ot_price'] = isset($sukValue[$suk]['ot_price']) ? floatval($sukValue[$suk]['ot_price']) : 0;
                $valueNew[$count]['stock'] = $sukValue[$suk]['stock'] ? intval($sukValue[$suk]['stock']) : 0;
                $valueNew[$count]['bar_code'] = $sukValue[$suk]['bar_code'] ?? '';
                $valueNew[$count]['bar_code_number'] = $sukValue[$suk]['bar_code_number'] ?? '';
                if ($is_virtual) {
                    if ($virtual_type == 1) {
                        if (!$type) {
                            $valueNew[$count]['virtual_list'] = $virtualService->getArr($sukValue[$suk]['unique'], $id);
                            $valueNew[$count]['disk_info'] = $sukValue[$suk]['disk_info'] ?? '';
                        }
                    } elseif ($virtual_type == 2) {
                        $valueNew[$count]['coupon_id'] = $sukValue[$suk]['coupon_id'] ?? '';
                        $valueNew[$count]['coupon_name'] = $storeCouponIssueServices->value(['id' => $sukValue[$suk]['coupon_id']], 'title');
                    }
                }
                $valueNew[$count]['weight'] = floatval($sukValue[$suk]['weight']) ?? 0;
                $valueNew[$count]['volume'] = floatval($sukValue[$suk]['volume']) ?? 0;
                $count++;
            }
        }
        $header[] = ['title' => '图片', 'slot' => 'pic', 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '售价', 'slot' => 'price', 'align' => 'center', 'minWidth' => 120];
        $header[] = ['title' => '成本价', 'slot' => 'cost', 'align' => 'center', 'minWidth' => 140];
        $header[] = ['title' => '划线价', 'slot' => 'ot_price', 'align' => 'center', 'minWidth' => 140];
        $header[] = ['title' => '库存', 'slot' => 'stock', 'align' => 'center', 'minWidth' => 140];
        $header[] = ['title' => '商品编码', 'slot' => 'bar_code', 'align' => 'center', 'minWidth' => 140];
        $header[] = ['title' => '条形码', 'slot' => 'bar_code_number', 'align' => 'center', 'minWidth' => 140];
        if ($is_virtual) {
            if ($virtual_type == 1) {
                $header[] = ['title' => '虚拟商品', 'slot' => 'fictitious', 'align' => 'center', 'minWidth' => 140];
            } elseif ($virtual_type == 2) {
                $header[] = ['title' => '虚拟商品', 'slot' => 'fictitious', 'align' => 'center', 'minWidth' => 140];
            }
        } else {
            $header[] = ['title' => '重量(KG)', 'slot' => 'weight', 'align' => 'center', 'minWidth' => 140];
            $header[] = ['title' => '体积(m³)', 'slot' => 'volume', 'align' => 'center', 'minWidth' => 140];
        }
        $header[] = ['title' => '操作', 'slot' => 'action', 'align' => 'center', 'minWidth' => 70];
        return ['attr' => $attr, 'value' => $valueNew, 'header' => $header];
    }

    /**
     * SPU
     * @return string
     */
    public function createSpu()
    {
        return substr(implode(NULL, array_map('ord', str_split(substr(uniqid(), 7, 13), 1))), 0, 8) . str_pad((string)mt_rand(1, 99999), 5, '0', STR_PAD_LEFT);
    }

    /**
     * 新增编辑商品
     * @param int $id
     * @param array $data
     */
    public function save(int $id, array $data)
    {
        if (count($data['cate_id']) < 1) throw new AdminException('请选择商品分类');
        if (!$data['store_name']) throw new AdminException('请输入商品名称');
        if (count($data['slider_image']) < 1) throw new AdminException('请选择商品轮播图');
        if ($data['is_limit'] == 1 && $data['min_qty'] > $data['limit_num']) throw new AdminException('起购数量不能大于限购数量');

        $detail = $data['attrs'];
        $attr = $data['items'];
        $cate_id = $data['cate_id'];
        $coupon_ids = $data['coupon_ids'];
        $description = $data['description'];
        $type = $data['type'];
        $data['recommend_list'] = count($data['recommend_list']) ? implode(',', array_column($data['recommend_list'], 'product_id')) : '';
        $data['is_sub'] = in_array(1, $data['is_sub']) ? 1 : 0;
        $data['presale'] = intval($data['presale']);
        $data['presale_start_time'] = $data['presale'] ? strtotime($data['presale_time'][0]) : 0;
        $data['presale_end_time'] = $data['presale'] ? strtotime($data['presale_time'][1]) : 0;
        $data['is_limit'] = intval($data['is_limit']);
        if (!$data['is_limit']) {
            $data['limit_type'] = 0;
            $data['limit_num'] = 0;
        } else {
            if (!in_array($data['limit_type'], [1, 2])) throw new AdminException('请选择限购类型');
            if ($data['limit_num'] <= 0) throw new AdminException('限购数量不能小于1');
        }
        $data['is_virtual'] = in_array($data['virtual_type'], [1, 2]) > 0 ? 1 : 0;
        $data['logistics'] = implode(',', $data['logistics']);
        $data['custom_form'] = json_encode($data['custom_form']);
        $data['params_list'] = json_encode($data['params_list']);
        $data['label_list'] = implode(',', $data['label_list']);
        $data['protection_list'] = implode(',', $data['protection_list']);
        if ($data['freight'] == 2) {
            $data['temp_id'] = 0;
        } elseif ($data['freight'] == 3) {
            $data['postage'] = 0;
        }
        $data['is_hot'] = $data['is_benefit'] = $data['is_new'] = $data['is_good'] = $data['is_best'] = 0;
        foreach ($data['recommend'] as $item) {
            $data[$item] = 1;
        }
        foreach ($detail as &$item) {
            if ($data['is_sub'] == 0) {
            }
            if (false) {
                throw new AdminException('一二级返佣相加不能大于商品售价');
            }
            if (isset($item['detail'])) {
                foreach ($item['detail'] as $detail_k => $detail_v) {
                    if (preg_match('/[=;]/', $detail_k) === 1 || preg_match('/[=;]/', $detail_v) === 1) {
                        throw new AdminException('规格以及规格值中不能包含=或;符号');
                    }
                }
            }
        }
        foreach ($data['activity'] as $k => $v) {
            if ($v == '拼团') {
                $data['activity'][$k] = 3;
            } else {
                $data['activity'][$k] = 0;
            }
        }

        if ($data['spec_type'] == 1) {
            $defaultItems = array_filter($detail, function ($item) {
                return $item['is_default_select'] === 1;
            });
            if (!empty($defaultItems)) {
                $defaultItem = reset($defaultItems);
                $data['price'] = $defaultItem['price'];
                $data['ot_price'] = $defaultItem['ot_price'];
                $data['cost'] = $defaultItem['cost'] ?? 0;
            } else {
                $filtered = array_filter($detail, function ($item) {
                    return $item['is_show'] == 1;
                });
                $data['price'] = min(array_column($filtered, 'price'));
                $data['ot_price'] = min(array_column($filtered, 'ot_price'));
                $data['cost'] = isset($data['cost']) ? min(array_column($filtered, 'cost')) : 0;
                if (!$data['cost']) {
                    $data['cost'] = 0;
                }
            }
        } else {
            $data['price'] = min(array_column($detail, 'price'));
            $data['ot_price'] = min(array_column($detail, 'ot_price'));
            $data['cost'] = isset($data['cost']) ? min(array_column($detail, 'cost')) : 0;
            if (!$data['cost']) {
                $data['cost'] = 0;
            }
        }

        $data['activity'] = implode(',', $data['activity']);
        $data['cate_id'] = implode(',', $data['cate_id']);
        $data['label_id'] = implode(',', $data['label_id']);
        $slider_image = $data['slider_image'];
        $data['image'] = $data['slider_image'][0];
        $data['slider_image'] = json_encode($data['slider_image']);
        $data['stock'] = array_sum(array_column($detail, 'stock'));
        unset($data['description'], $data['coupon_ids'], $data['items'], $data['attrs'], $data['type']);
        /** @var StoreDescriptionServices $storeDescriptionServices */
        $storeDescriptionServices = app()->make(StoreDescriptionServices::class);
        /** @var StoreProductCateServices $storeProductCateServices */
        $storeProductCateServices = app()->make(StoreProductCateServices::class);
        /** @var StoreProductAttrServices $storeProductAttrServices */
        $storeProductAttrServices = app()->make(StoreProductAttrServices::class);
        /** @var StoreProductCouponServices $storeProductCouponServices */
        $storeProductCouponServices = app()->make(StoreProductCouponServices::class);
        /** @var StoreCategoryServices $storeCategoryServices */
        $storeCategoryServices = app()->make(StoreCategoryServices::class);
        $is_copy = $data['is_copy'] ?? 0;
        unset($data['is_copy']);
        $descriptionImages = [];
        if (isset($data['description_images'])) {
            $descriptionImages = $data['description_images'];
        }
        $this->transaction(function () use ($id, $is_copy, $data, $descriptionImages, $description, $cate_id, $storeDescriptionServices, $storeProductCateServices, $storeProductAttrServices, $storeProductCouponServices, $storeCategoryServices, $detail, $attr, $coupon_ids, $type, $slider_image) {
            if ($data['spec_type'] == 0) {
                $attr = [
                    [
                        'value' => '规格',
                        'detailValue' => '',
                        'attrHidden' => '',
                        'detail' => ['默认']
                    ]
                ];
                $detail[0]['value1'] = '规格';
                $detail[0]['detail'] = ['规格' => '默认'];
                $data['default_sku'] = '';
            }
            foreach ($detail as &$item) {
                $item['is_virtual'] = $data['is_virtual'];
                if ($data['spec_type'] == 1) {
                    if ($item['is_default_select'] == 1) {
                        $data['default_sku'] = implode(",", $item['attr_arr']);
                    }
                }
            }
            if ($id) {
                $oldInfo = $this->get($id)->toArray();
                if ($oldInfo['virtual_type'] != $data['virtual_type']) {
                    throw new AdminException('商品类型不能切换');
                }
                unset($data['sales']);
                $this->dao->update($id, $data);
                $storeDescriptionServices->saveDescription($id, $description);
                $cateData = [];
                $time = time();
                $cateGory = $storeCategoryServices->getColumn([['id', 'IN', $cate_id]], 'id,pid', 'id');
                foreach ($cate_id as $cid) {
                    if ($cid && isset($cateGory[$cid]['pid'])) {
                        $cateData[] = ['product_id' => $id, 'cate_id' => $cid, 'cate_pid' => $cateGory[$cid]['pid'] ?: $cid, 'status' => $data['is_show'], 'add_time' => $time];
                    }
                }
                $storeProductCateServices->change($id, $cateData);
                $skuList = $this->validateProductAttr($attr, $detail, $id);
                $attrRes = $storeProductAttrServices->saveProductAttr($skuList, $id, 0, 0, $data['virtual_type']);
                if (!empty($coupon_ids)) {
                    $storeProductCouponServices->setCoupon($id, $coupon_ids);
                } else {
                    $storeProductCouponServices->delete(['product_id' => $id]);
                }
                if (!$attrRes) throw new AdminException('添加失败');
            } else {
                $data['add_time'] = time();
                $data['code_path'] = '';
                $data['spu'] = $this->createSpu();
                $res = $this->dao->save($data);
                $storeDescriptionServices->saveDescription($res->id, $description);
                $cateData = [];
                $time = time();
                $cateGory = $storeCategoryServices->getColumn([['id', 'IN', $cate_id]], 'id,pid', 'id');
                foreach ($cate_id as $cid) {
                    if ($cid && isset($cateGory[$cid]['pid'])) {
                        $cateData[] = ['product_id' => $res->id, 'cate_id' => $cid, 'cate_pid' => $cateGory[$cid]['pid'], 'status' => $data['is_show'], 'add_time' => $time];
                    }
                }
                $storeProductCateServices->change($res->id, $cateData);
                $skuList = $this->validateProductAttr($attr, $detail, $res->id, 0, 1, true);
                $attrRes = $storeProductAttrServices->saveProductAttr($skuList, $res->id, 0, 0, $data['virtual_type']);
                if (!empty($coupon_ids)) $storeProductCouponServices->setCoupon($res->id, $coupon_ids);
                if (!$attrRes) throw new AdminException('添加失败');

                //采集商品下载图片
                if ($type == -1) {
                    $s_image_down = [];
                    //下载商品轮播图
                    foreach ($slider_image as $s_image) {
                        if (sys_config('queue_open', 0) == 1) {
                            ProductCopyJob::dispatch('copySliderImage', [$res->id, $s_image, count($slider_image)]);
                        } else {
                            //下载图片
                            $s_image_down[] = app()->make(CopyTaobaoServices::class)->downloadCopyImage(!is_int(strpos($s_image, 'http')) ? 'http://' . ltrim($s_image, '\//') : $s_image);
                        }
                    }

                    //下载商品详情图
                    preg_match_all('#<img.*?src="([^"]*)"[^>]*>#i', $description, $match);
                    foreach ($match[1] as $d_image) {
                        if (sys_config('queue_open', 0) == 1) {
                            ProductCopyJob::dispatch('copyDescriptionImage', [$res->id, $description, $d_image, count($match[1])]);
                        } else {
                            $d_img = app()->make(CopyTaobaoServices::class)->downloadCopyImage(!is_int(strpos($d_image, 'http')) ? 'http://' . ltrim($d_image, '\//') : $d_image);
                            $description = str_replace($d_image, $d_img, $description);
                        }
                    }

                    //下载商品规格图
                    $productAttrValue = app()->make(StoreProductAttrValueServices::class);
                    $attrValueList = $productAttrValue->getColumn(['product_id' => $res->id, 'type' => 0], 'image', 'id');
                    foreach ($attrValueList as $value_id => $value_image) {
                        if (sys_config('queue_open', 0) == 1) {
                            ProductCopyJob::dispatch('copyAttrImage', [$value_id, $value_image]);
                        } else {
                            $v_img = app()->make(CopyTaobaoServices::class)->downloadCopyImage(!is_int(strpos($value_image, 'http')) ? 'http://' . ltrim($value_image, '\//') : $value_image);
                            $productAttrValue->update($value_id, ['image' => $v_img]);
                        }
                    }

                    if (sys_config('queue_open', 0) == 0) {
                        $this->update($res->id, ['slider_image' => $s_image_down ? json_encode($s_image_down) : '', 'image' => $s_image_down[0]]);
                        $storeDescriptionServices->saveDescription((int)$res->id, $description);
                    }
                }
            }
        });
    }

    /**
     * 添加商品属性数据判断
     * @param array $attrList
     * @param array $valueList
     * @param int $productId
     * @param int $type
     * @param int $validate
     * @param bool $isNew
     * @return array
     */
    public function validateProductAttr(array $attrList, array $valueList, int $productId, $type = 0, int $validate = 1, bool $isNew = false)
    {
        $result = ['attr' => $attrList, 'value' => $valueList];
        $attrValueList = [];
        $attrNameList = [];
        foreach ($attrList as $index => $attr) {
            if (!isset($attr['value'])) {
                throw new AdminException('请输入规则名称');
            }
            $attr['value'] = trim($attr['value']);
            if (!isset($attr['value'])) {
                throw new AdminException('请输入规则名称');
            }
            if (!isset($attr['detail']) || !count($attr['detail'])) {
                throw new AdminException('请输入属性名称');
            }
            foreach ($attr['detail'] as $k => $attrValue) {
                if (is_string($attrValue)) {
                    $attrValueTemp = $attrValue;
                    $attrValue = [];
                    $attrValue['value'] = $attrValueTemp;
                    $attrValue['pic'] = '';
                } else {
                    $attrValue['value'] = trim($attrValue['value']);
                    $attrValue['pic'] = isset($attr['add_pic']) ? $attr['add_pic'] == 1 ? trim($attrValue['pic']) : '' : '';
                }
                if (empty($attrValue['value'])) {
                    throw new AdminException('请输入正确的属性');
                }
                $attr['detail'][$k] = $attrValue;
                $attrValueList[] = $attrValue;
            }
            $attrNameList[] = $attr['value'];
            $attrList[$index] = $attr;
        }
        $attrCount = count($attrList);
        foreach ($valueList as $index => $value) {
            if (!isset($value['detail']) || count($value['detail']) != $attrCount) {
                throw new AdminException('请填写正确的商品信息');
            }
            if (!isset($value['price']) || !is_numeric($value['price']) || floatval($value['price']) != $value['price']) {
                throw new AdminException('请填写正确的商品价格');
            }
            if ($validate && (!isset($value['stock']) || !is_numeric($value['stock']) || intval($value['stock']) != $value['stock'])) {
                throw new AdminException('请填写正确的商品库存');
            }
            if (!isset($value['cost']) || !is_numeric($value['cost']) || floatval($value['cost']) != $value['cost']) {
                throw new AdminException('请填写正确的商品成本价格');
            }
            if ($validate && (!isset($value['pic']) || empty($value['pic']))) {
                throw new AdminException('请设置规格图片');
            }
            foreach ($value['detail'] as $attrName => $attrValue) {
                //如果attrName 存在空格 则这个规格key 会出现两次
                unset($valueList[$index]['detail'][$attrName]);
                $attrName = trim($attrName);
                $attrValue = trim($attrValue);
                if (!in_array($attrName, $attrNameList, true)) {
                    throw new AdminException('{:name}规格不存在', ['name' => $attrName]);
                }
                if (!in_array($attrValue, array_column($attrValueList, 'value'), true)) {
                    throw new AdminException('{:name}属性不存在', ['name' => $attrValue]);
                }
                if (empty($attrName)) {
                    throw new AdminException('请输入正确的属性');
                }
                $valueList[$index]['detail'][$attrName] = $attrValue;
            }
        }
        $attrGroup = [];
        $valueGroup = [];
        foreach ($attrList as $k => $value) {
            $attrGroup[] = [
                'product_id' => $productId,
                'attr_name' => $value['value'],
                'attr_values' => $value['detail'],
                'type' => $type
            ];
        }
        /** @var StoreProductAttrValueServices $storeProductAttrValueServices */
        $storeProductAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        $skuArray = $storeProductAttrValueServices->getColumn(['product_id' => $productId, 'type' => $type], 'unique', 'suk');
        foreach ($valueList as $k => $value) {
            $sku = implode(',', array_map(function ($key) use ($value) {
                return $value['detail'][$key];
            }, array_column($attrList, 'value')));
            $skuValue = [
                'product_id' => $productId,
                'suk' => $sku,
                'price' => $value['price'],
                'cost' => $value['cost'],
                'ot_price' => $value['ot_price'],
                'unique' => $isNew ? '' : $value['unique'] ?? '',
                'image' => $value['pic'],
                'bar_code' => $value['bar_code'] ?? '',
                'bar_code_number' => $value['bar_code_number'] ?? '',
                'weight' => $value['weight'] ?? 0,
                'volume' => $value['volume'] ?? 0,
                'type' => $type,
                'quota' => $value['quota'] ?? 0,
                'quota_show' => $value['quota'] ?? 0,
                'is_virtual' => $value['is_virtual'] ?? 0,
                'coupon_id' => $value['coupon_id'] ?? 0,
                'virtual_list' => $value['virtual_list'] ?? [],
                'disk_info' => $value['disk_info'] ?? '',
                'is_show' => $value['is_show'] ?? 1,
                'is_default_select' => $value['is_default_select'] ?? 0,
            ];

            if ($validate) {
                $skuValue['stock'] = $value['stock'];
            }
            $valueGroup[$sku] = $skuValue;
        }

        if (!count($attrGroup) || !count($valueGroup)) {
            throw new AdminException('请设置至少一个属性');
        }
        $result = ['attr' => $attrList, 'value' => $valueList];
        return compact('result', 'attrGroup', 'valueGroup');
    }

    /**
     * 放入回收站
     * @param int $id
     * @return string
     */
    public function del(int $id)
    {
        if (!$id) throw new AdminException('参数错误');
        $productInfo = $this->dao->get($id);
        if (!$productInfo) throw new AdminException('商品不存在');
        /** @var StoreProductCateServices $storeProductCateServices */
        $storeProductCateServices = app()->make(StoreProductCateServices::class);
        if ($productInfo['is_del'] == 1) {
            $data['is_del'] = 0;
            $res = $this->dao->update($id, $data);
            $storeProductCateServices->update(['product_id' => $id], ['status' => 1]);
            if (!$res) throw new AdminException('恢复失败');
            return '恢复成功';
        } else {
            $data['is_del'] = 1;
            $data['is_show'] = 0;
            $res = $this->dao->update($id, $data);
            $storeProductCateServices->update(['product_id' => $id], ['status' => 0]);
            if (!$res) throw new AdminException('删除失败');
            return '移动回收站成功';
        }
    }

    /**
     * 获取选择的商品列表
     * @param array $where
     * @return array
     */
    public function searchList(array $where, bool $isStock = false, $is_page = true)
    {
        $store_stock = sys_config('store_stock');
        $where['store_stock'] = $store_stock > 0 ? $store_stock : 2;
        $data = $this->getProductList($where, $isStock, $is_page);
        $cateIds = implode(',', array_column($data['list'], 'cate_id'));

        /** @var StoreCategoryServices $storeCategoryServices */
        $storeCategoryServices = app()->make(StoreCategoryServices::class);
        $cateList = $storeCategoryServices->getCateArray($cateIds);

        foreach ($data['list'] as &$item) {
            $cateName = array_filter($cateList, function ($val) use ($item) {
                if (in_array($val['id'], explode(',', $item['cate_id']))) {
                    return $val;
                }
            });
            $item['cate_name'] = implode(',', array_column($cateName, 'cate_name'));
            $item['price'] = floatval($item['price']);
            $item['ot_price'] = floatval($item['ot_price']);
            $item['postage'] = floatval($item['postage']);
            $item['cost'] = floatval($item['cost']);
            $item['is_product_type'] = 1;
            $item['logistics'] = explode(',', $item['logistics']);
            $attrs = $this->getProductRules($item['id'], 0)['attrs'];
            $key = 0;
            foreach ($attrs as $items) {
                $item['attrs'][$key] = $items;
                $item['attrs'][$key]['suk'] = implode(',', $items['detail']);
                $item['attrs'][$key]['product_price'] = $items['price'];
                $key += 1;
            }
        }
        return $data;
    }

    /**
     * 后台获取商品列表展示
     * @param array $where
     * @return array
     */
    public function getProductList(array $where, bool $isStock = true, $is_page = true)
    {
        $prefix = Config::get('database.connections.' . Config::get('database.default') . '.prefix');
        if ($isStock) {
            $field = [
                '*',
                '(SELECT count(*) FROM `' . $prefix . 'store_product_relation` WHERE `product_id` = `' . $prefix . 'store_product`.`id` AND `type` = \'collect\') as collect',
                '(SELECT count(*) FROM `' . $prefix . 'store_product_relation` WHERE `product_id` = `' . $prefix . 'store_product`.`id` AND `type` = \'like\') as likes',
                '(SELECT SUM(stock) FROM `' . $prefix . 'store_product_attr_value` WHERE `product_id` = `' . $prefix . 'store_product`.`id` AND `type` = 0) as stock',
                //                '(SELECT SUM(sales) FROM `' . $prefix . 'store_product_attr_value` WHERE `product_id` = `' . $prefix . 'store_product`.`id` AND `type` = 0) as sales',
                '(SELECT count(*) FROM `' . $prefix . 'store_visit` WHERE `product_id` = `' . $prefix . 'store_product`.`id` AND `product_type` = \'product\') as visitor',
            ];
        } else {
            $field = ['*'];
        }
        [$page, $limit] = $this->getPageValue($is_page);
        $list = $this->dao->getSearchList($where, $page, $limit, $field, ['description']);
        foreach ($list as &$product) {
            $product['product_price'] = $product['price'];
            $attrValue = $product['attrs'] ?? [];
            foreach ($attrValue as &$value) {
                $value['product_price'] = $value['price'];
            }
            $product['attrs'] = $attrValue;
        }
        $count = $this->dao->getCount($where);
        return compact('count', 'list');
    }

    /**
     * 获取商品规格
     * @param int $id
     * @param int $type
     * @return array
     */
    public function getProductRules(int $id, int $type = 0)
    {
        /** @var StoreProductAttrServices $storeProductAttrService */
        $storeProductAttrService = app()->make(StoreProductAttrServices::class);
        /** @var StoreProductAttrValueServices $storeProductAttrValueServices */
        $storeProductAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        $productAttr = $storeProductAttrService->getProductAttr(['product_id' => $id, 'type' => 0]);
        if (!$productAttr) return [];
        $attr = [];
        foreach ($productAttr as $key => $value) {
            $attr[$key]['value'] = $value['attr_name'];
            $attr[$key]['detailValue'] = '';
            $attr[$key]['attrHidden'] = true;
            $attr[$key]['detail'] = $value['attr_values'];
        }
        list($value, $head) = attr_format($attr);
        $valueNew = [];
        $count = 0;
        $sukValue = $sukDefaultValue = $storeProductAttrValueServices->getSkuArray(['product_id' => $id, 'type' => 0]);
        foreach ($value as $suk) {
            $detail = explode(',', $suk);
            if (!isset($sukDefaultValue[$suk])) continue;
            foreach ($head as $k => $title) {
                $header[$k]['title'] = $title;
                $header[$k]['align'] = 'center';
                $header[$k]['minWidth'] = 80;
            }
            foreach ($detail as $k => $v) {
                $valueNew[$count]['value' . ($k + 1)] = $v;
                $header[$k]['key'] = 'value' . ($k + 1);
            }
            $valueNew[$count]['detail'] = array_combine($head, $detail);
            $valueNew[$count]['pic'] = $sukValue[$suk]['pic'];
            $valueNew[$count]['price'] = floatval($sukValue[$suk]['price']);
            if ($type == 2) $valueNew[$count]['min_price'] = 0;
            if (in_array($type, [1, 2, 3])) $valueNew[$count]['r_price'] = floatval($sukValue[$suk]['price']);
            $valueNew[$count]['cost'] = floatval($sukValue[$suk]['cost']);
            $valueNew[$count]['ot_price'] = floatval($sukValue[$suk]['ot_price']);
            $valueNew[$count]['stock'] = intval($sukValue[$suk]['stock']);
            $valueNew[$count]['quota'] = intval($sukValue[$suk]['quota']);
            $valueNew[$count]['bar_code'] = $sukValue[$suk]['bar_code'];
            $valueNew[$count]['bar_code_number'] = $sukValue[$suk]['bar_code_number'];
            $valueNew[$count]['unique'] = $sukValue[$suk]['unique'];
            $valueNew[$count]['weight'] = $sukValue[$suk]['weight'] ? floatval($sukValue[$suk]['weight']) : 0;
            $valueNew[$count]['volume'] = $sukValue[$suk]['volume'] ? floatval($sukValue[$suk]['volume']) : 0;
            $count++;
        }
        $header[] = ['title' => '图片', 'slot' => 'pic', 'align' => 'center', 'minWidth' => 120];
        if ($type == 1) {
            $header[] = ['title' => '成本价', 'key' => 'cost', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '日常售价', 'key' => 'r_price', 'align' => 'center', 'minWidth' => 80];
        } elseif ($type == 2) {
            $header[] = ['title' => '成本价', 'key' => 'cost', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '日常售价', 'key' => 'r_price', 'align' => 'center', 'minWidth' => 80];
        } elseif ($type == 3) {
            $header[] = ['title' => '拼团价', 'slot' => 'price', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '成本价', 'key' => 'cost', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '日常售价', 'key' => 'r_price', 'align' => 'center', 'minWidth' => 80];
        } elseif ($type == 4) {
            $header[] = ['title' => '兑换积分', 'slot' => 'price', 'type' => 1, 'align' => 'center', 'minWidth' => 80];
        } elseif ($type == 6) {
            $header[] = ['title' => '预售价', 'key' => 'price', 'type' => 1, 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '成本价', 'key' => 'cost', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '划线价', 'key' => 'ot_price', 'align' => 'center', 'minWidth' => 80];
        } else {
            $header[] = ['title' => '成本价', 'key' => 'cost', 'align' => 'center', 'minWidth' => 80];
            $header[] = ['title' => '划线价', 'key' => 'ot_price', 'align' => 'center', 'minWidth' => 80];
        }
        $header[] = ['title' => '库存', 'key' => 'stock', 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '限量', 'slot' => 'quota', 'type' => 1, 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '重量(KG)', 'key' => 'weight', 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '体积(m³)', 'key' => 'volume', 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '商品编码', 'key' => 'bar_code', 'align' => 'center', 'minWidth' => 80];
        $header[] = ['title' => '条形码', 'key' => 'bar_code_number', 'align' => 'center', 'minWidth' => 80];
        return ['items' => $attr, 'attrs' => $valueNew, 'header' => $header];
    }

    /**
     * 检查商品是否有活动
     * @param  $id
     * @return bool
     */
    public function checkActivity($id = 0, $return = false)
    {
        if ($id) {
            /** @var StoreCombinationServices $storeCombinationService */
            $storeCombinationService = app()->make(StoreCombinationServices::class);
            $res3 = $storeCombinationService->count(['product_id' => $id, 'is_del' => 0]);
            if ($res3) {
                if ($return) {
                    return false;
                } else {
                    throw new AdminException('商品参与拼团活动开启，无法进行此操作');
                }
            }
        }
        return true;
    }

    /**
     * 保存
     * @param array $data
     * @return mixed
     */
    public function create(array $data)
    {
        return $this->dao->save($data);
    }

    /**
     * 前台获取商品列表
     * @param array $where
     * @param int $uid
     * @return array|array[]
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getGoodsList(array $where, int $uid)
    {
        $where['is_show'] = 1;
        $where['is_del'] = 0;
        $where['star'] = 1;
        $ifKeyword = isset($where['store_name']) && $where['store_name'];
        if ($ifKeyword) {
            app()->make(UserSearchServices::class)->saveUserSearch($uid, $where['store_name'], [$where['store_name']], []);
        }
        [$page, $limit] = $this->getPageValue();
        $list = $this->dao->getSearchList($where, $page, $limit, ['id,store_name,cate_id,image,IFNULL(sales, 0) + IFNULL(ficti, 0) as sales,price,stock,activity,ot_price,spec_type,recommend_image,unit_name,is_virtual,presale,custom_form,virtual_type,min_qty,label_list']);

        // 提取所有 label_list 并过滤空值
        $labelLists = array_map(function ($item) {
            return $item['label_list'];
        }, $list);

        // 将 label_list 转换为数组，过滤空值，并去重
        $uniqueLabels = array_unique(array_reduce($labelLists, function ($carry, $labels) {
            // 将 label_list 按逗号分割成数组
            $labelsArray = explode(',', $labels);
            // 过滤掉空值
            $labelsArray = array_filter($labelsArray, function ($label) {
                return !empty(trim($label));
            });
            return array_merge($carry, $labelsArray);
        }, []));

        $labelList = app()->make(StoreProductLabelServices::class)->labelListByIds($uniqueLabels);
        // 使用 id 作为键
        $labelList = array_column($labelList, null, 'id');

        foreach ($list as &$item) {
            $item['cart_button'] = $item['is_virtual'] || $item['virtual_type'] == 3 || $item['presale'] || json_decode($item['custom_form'], true) ? 0 : 1;
            if (count($item['star'])) {
                $item['star'] = bcdiv((string)array_sum(array_column($item['star'], 'product_score')), (string)count($item['star']), 1);
            } else {
                $item['star'] = '5.0';
            }
            $item['label_list'] = $item['label_list'] != '' ? array_map(function ($labelId) use ($labelList) {
                return $labelList[$labelId] ?? [];
            }, explode(',', $item['label_list'])) : [];
        }
        $list = $this->getActivityList($list);
        $list = $this->getProduceOtherList($list, $uid, !!$where['type']);
        return $list;
    }

    /**
     * 获取某些模板所需得购物车数量
     * @param array $list
     * @param int $uid
     * @return array
     */
    public function getProduceOtherList(array $list, int $uid, bool $type = true)
    {
        if (!$type || !$list) {
            return $list;
        }
        $productIds = array_column($list, 'id');
        if ($productIds) {
            /** @var StoreProductAttrValueServices $services */
            $services = app()->make(StoreProductAttrValueServices::class);
            $attList = $services->getColumn([
                'product_id' => $productIds,
                'type' => 0
            ], 'count(*)', 'product_id');
            if ($uid) {
                /** @var StoreCartServices $cartServices */
                $cartServices = app()->make(StoreCartServices::class);
                $cartNumList = $cartServices->productIdByCartNum($productIds, $uid);
                $data = [];
                foreach ($cartNumList as $item) {
                    $data[$item['product_id']][] = $item['cart_num'];
                }
                $newNumList = [];
                foreach ($data as $key => $item) {
                    $newNumList[$key] = array_sum($item);
                }
                $cartNumList = $newNumList;
            } else {
                $cartNumList = [];
            }
            foreach ($list as &$item) {
                if ($item['spec_type']) {
                    $item['is_att'] = isset($attList[$item['id']]) && $attList[$item['id']];
                } else {
                    $item['is_att'] = false;
                }
                $item['cart_num'] = $cartNumList[$item['id']] ?? 0;
            }
        }
        return $list;
    }

    /**
     * 获取商品活动标签
     * @param array $list
     * @param array $productIds
     * @return array
     */
    public function getActivityList(array $list, bool $status = true, $pinkIdsList = false)
    {
        if (!$list) return [];
        if ($status) {
            $productIds = array_column($list, 'id');
        } else {
            $productIds = [$list['id']];
            $list = [$list];
        }
        if ($pinkIdsList === false) {
            /** @var StoreCombinationServices $storeCombinationServices */
            $storeCombinationServices = app()->make(StoreCombinationServices::class);
            $pinkIdsList = $storeCombinationServices->getPinkIdsArray($productIds, ['id']);
        }

        /** @var StoreCouponIssueServices $couponIssueServices */
        $couponIssueServices = app()->make(StoreCouponIssueServices::class);

        foreach ($list as &$item) {
            $item['activity'] = $this->activity($item['activity'], $item['id'], $pinkIdsList[$item['id']] ?? 0, $status);
            $item['checkCoupon'] = $couponIssueServices->checkProductCoupon($item['id']);
        }
        if ($status) {
            return $list;
        } else {
            return $list[0]['activity'];
        }
    }

    /**
     * 获取商品在此时段活动优先类型
     * @param string $activity
     * @param int $id
     * @param int $combinationId
     * @param bool $status
     * @return array
     */
    public function activity(string $activity, int $id, int $combinationId, bool $status = true)
    {
        if (!$activity) {
            $activity = '0,3'; //如果老商品没有活动顺序，默认活动顺序，拼团
        }
        $activity = explode(',', $activity);
        if ($activity[0] == 0 && $status) return [];
        $activityId = [];
        if ($combinationId) $activityId[3] = $combinationId;
        $data = [];
        foreach ($activity as $k => $v) {
            if (array_key_exists($v, $activityId)) {
                if ($status) {
                    $data['type'] = $v;
                    $data['id'] = $activityId[$v];
                    break;
                } else {
                    if ($v != 0) {
                        $arr['type'] = $v;
                        $arr['id'] = $activityId[$v];
                        $data[] = $arr;
                    }
                }
            }
        }
        return $data;
    }

    /**
     * 获取热门商品
     * @param array $where
     * @param int $num
     * @return array|array[]
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProducts(array $where, int $num = 0)
    {
        [$page, $limit] = $this->getPageValue();
        if ($num) {
            $page = 1;
            $limit = $num;
        }
        $list = $this->dao->getSearchList($where, $page, $limit, ['id,store_name,cate_id,image,IFNULL(sales, 0) + IFNULL(ficti, 0) as sales,price,stock,activity,unit_name,presale']);
        $list = $this->getActivityList($list);
        return $list;
    }

    /**
     * 获取商品详情
     * @param Request $request
     * @param int $id
     * @param int $type
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function productDetail(Request $request, int $id, int $type)
    {
        $uid = (int)$request->uid();
        $data['uid'] = $uid;

        $storeInfo = $this->dao->getOne(['id' => $id, 'is_show' => 1, 'is_del' => 0], '*', ['description']);
        if (!$storeInfo) {
            throw new AdminException('商品不存在');
        } else {
            $storeInfo = $storeInfo->toArray();
        }
        $siteUrl = sys_config('site_url');
        $storeInfo['image'] = set_file_url($storeInfo['image'], $siteUrl);
        $storeInfo['image_base'] = set_file_url($storeInfo['image'], $siteUrl);
        $storeInfo['video_link'] = empty($storeInfo['video_link']) ? '' : (strpos($storeInfo['video_link'], 'http') === false ? (sys_config('site_url') . $storeInfo['video_link']) : $storeInfo['video_link']);
        $storeInfo['fsales'] = $storeInfo['ficti'] + $storeInfo['sales'];
        $storeInfo['custom_form'] = json_decode($storeInfo['custom_form'], true);
        $storeInfo['params_list'] = json_decode($storeInfo['params_list'], true) ?? [];
        if ($storeInfo['label_list'] != '') {
            $labelIds = explode(',', $storeInfo['label_list']);
            $storeInfo['label_list'] = [];
            $labelList = app()->make(StoreProductLabelServices::class)->labelListByIds($labelIds);
            foreach ($labelIds as $labelId) {
                foreach ($labelList as $label) {
                    if ($labelId == $label['id']) {
                        $storeInfo['label_list'][] = $label;
                    }
                }
            }
        } else {
            $storeInfo['label_list'] = [];
        }
        if ($storeInfo['protection_list'] != '') {
            $storeInfo['protection_list'] = app()->make(StoreProductProtectionServices::class)->protectionListByIds(explode(',', $storeInfo['protection_list']));
        } else {
            $storeInfo['protection_list'] = [];
        }
        $storeInfo['slider_image'] = set_file_url($storeInfo['slider_image'], $siteUrl);

        if (sys_config('share_qrcode', 0) && request()->isWechat()) {
            /** @var QrcodeServices $qrcodeService */
            $qrcodeService = app()->make(QrcodeServices::class);
            $storeInfo['wechat_code'] = $qrcodeService->getTemporaryQrcode('product-' . $id, $uid)->url;
        } else {
            $storeInfo['wechat_code'] = '';
        }

        /** @var StoreProductRelationServices $storeProductRelationServices */
        $storeProductRelationServices = app()->make(StoreProductRelationServices::class);
        $storeInfo['userCollect'] = $storeProductRelationServices->isProductRelation(['uid' => $uid, 'product_id' => $id, 'type' => 'collect', 'category' => 'product']);
        $storeInfo['userLike'] = false;
        $storeInfo['small_image'] = $storeInfo['image'];
        $storeInfo = get_thumb_water($storeInfo, 'small', ['small_image']);

        //预售相关
        if ($storeInfo['presale']) {
            if ($storeInfo['presale_start_time'] > time()) {
                $storeInfo['presale_pay_status'] = 1;
            } elseif ($storeInfo['presale_start_time'] <= time() && $storeInfo['presale_end_time'] > time()) {
                $storeInfo['presale_pay_status'] = 2;
            } elseif ($storeInfo['presale_end_time'] < time()) {
                $storeInfo['presale_pay_status'] = 3;
            } else {
                $storeInfo['presale_pay_status'] = 0;
            }
        } else {
            $storeInfo['presale_pay_status'] = 0;
        }
        $storeInfo['presale_start_time'] = date('Y-m-d H:i', $storeInfo['presale_start_time']);
        $storeInfo['presale_end_time'] = date('Y-m-d H:i', $storeInfo['presale_end_time']);

        //有自定义表单或预售或虚拟不展示加入购物车按钮
        $storeInfo['cart_button'] = $storeInfo['custom_form'] || $storeInfo['presale'] || $storeInfo['is_virtual'] || $storeInfo['virtual_type'] == 3 ? 0 : 1;

        /** @var StoreProductAttrServices $storeProductAttrServices */
        $storeProductAttrServices = app()->make(StoreProductAttrServices::class);
        list($productAttr, $productValue) = $storeProductAttrServices->getProductAttrDetail($id, $uid, $type, 0);
        $attrPics = [];
        foreach ($productAttr as $attrValues) {
            foreach ($attrValues['attr_value'] as $picArr) {
                if (isset($picArr['pic']) && $picArr['pic'] != '') {
                    $attrPics[] = $picArr['pic'];
                }
            }
        }
        $storeInfo['attrPics'] = $attrPics;
        //无属性添加默认属性
        if (empty($productValue)) {
            $attr = [
                [
                    'value' => '规格',
                    'detailValue' => '',
                    'attrHidden' => '',
                    'detail' => ['默认']
                ]
            ];
            $detail[0] = [
                'value1' => '默认',
                'detail' => ['规格' => '默认'],
                'pic' => $storeInfo['image'],
                'price' => $storeInfo['price'],
                'cost' => $storeInfo['cost'],
                'ot_price' => $storeInfo['ot_price'],
                'stock' => $storeInfo['stock'],
                'bar_code' => '',
                'bar_code_number' => '',
                'weight' => 0,
                'volume' => 0,
            ];
            $skuList = $this->validateProductAttr($attr, $detail, $id, 0, 1, true);
            $storeProductAttrServices->saveProductAttr($skuList, $id, 0);
        }
        $attrValue = $productValue;
        if (!$storeInfo['spec_type']) {
            $productAttr = [];
            $productValue = [];
            $data['spec_unique'] = $attrValue['默认']['unique'];
        } else {
            foreach ($productValue as &$sku) {
                if ($sku['is_show'] == 0) {
                    $storeInfo['stock'] = $storeInfo['stock'] - $sku['stock'];
                    $sku['stock'] = 0;
                }
            }
            $data['spec_unique'] = '';
        }
        $data['productAttr'] = $productAttr;
        $data['productValue'] = $productValue;
        $data['storeInfo'] = $storeInfo;

        $data['priceName'] = 0;
        if ($uid) {
            //用户访问事件
            event('UserVisitListener', [$uid, $id, 'product', $storeInfo['cate_id'], 'view']);
        }

        /** @var StoreProductReplyServices $storeProductReplyService */
        $storeProductReplyService = app()->make(StoreProductReplyServices::class);
        $data['reply'] = get_thumb_water($storeProductReplyService->getRecProductReply($id), 'big', ['pics']);
        [$replyCount, $goodReply, $replyChance] = $storeProductReplyService->getProductReplyData($id);
        $data['replyChance'] = $replyChance;
        $data['replyCount'] = $replyCount;
        $data['mer_id'] = 0;
        if ($storeInfo['recommend_list'] != '') {
            $recommend_list = explode(',', $storeInfo['recommend_list']);
            $data['good_list'] = $this->getProducts(['ids' => $recommend_list, 'is_del' => 0, 'is_show' => 1], 12);
            $recommend_count = 12 - count($data['good_list']);
            if ($recommend_count) $data['good_list'] = array_merge($data['good_list'], $this->getProducts(['is_good' => 1, 'is_del' => 0, 'is_show' => 1, 'not_ids' => $recommend_list], $recommend_count));
        } else {
            $data['good_list'] = $this->getProducts(['is_good' => 1, 'is_del' => 0, 'is_show' => 1], 12);
        }
        $data['mapKey'] = sys_config('tengxun_map_key');
        $data['store_self_mention'] = (int)sys_config('store_self_mention') ?? 0; //门店自提是否开启
        $data['activity'] = $this->getActivityList($data['storeInfo'], false);
        /** @var StoreCouponIssueServices $couponService */
        $couponService = app()->make(StoreCouponIssueServices::class);
        $data['coupons'] = $couponService->getIssueCouponList($uid, ['product_id' => $id, 'type' => -1])['list'];
        $data['routine_contact_type'] = sys_config('routine_contact_type', 0);
        //浏览记录
        ProductLogJob::dispatch(['visit', ['uid' => $uid, 'product_id' => $id]]);

        //自定义事件-用户商品访问
        event('CustomEventListener', ['user_product_visit', [
            'product_id' => $id,
            'uid' => $uid,
            'visit_time' => date('Y-m-d H:i:s'),
        ]]);

        return $data;
    }

    /**商品列表
     * @param array $where
     * @param $limit
     * @param $field
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProductLimit(array $where, $limit, $field)
    {
        return $this->dao->getProductLimit($where, $limit, $field);
    }

    /**通过条件获取商品列表
     * @param $where
     * @param $field
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProductListByWhere($where, $field)
    {
        return $this->dao->getProductListByWhere($where, $field);
    }

    /**
     * 根据指定id获取商品列表
     * @param array $ids
     * @param string $field
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProductColumn(array $ids, string $field = '')
    {
        $productData = [];
        $productInfoField = 'id,image,price,ot_price,postage,sales,stock,store_name,unit_name,is_show,is_del,is_postage,cost,temp_id';
        if (!empty($ids)) {
            $productAll = $this->dao->idByProductList($ids, $field ?: $productInfoField);
            if (!empty($productAll))
                $productData = array_combine(array_column($productAll, 'id'), $productAll);
        }
        return $productData;
    }

    /**
     * 商品是否存在
     * @param int $productId
     * @param string $field
     * @return array|\think\Model|null
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/02/15
     */
    public function isValidProduct(int $productId, string $field = '*')
    {
        return $this->dao->getOne(['id' => $productId, 'is_del' => 0, 'is_show' => 1], $field);
    }

    /**
     * 获取商品库存
     * @param int $productId
     * @param string $uniqueId
     * @return int|mixed
     */
    public function getProductStock(int $productId, string $uniqueId = '')
    {
        /** @var  StoreProductAttrValueServices $StoreProductAttrValue */
        $StoreProductAttrValue = app()->make(StoreProductAttrValueServices::class);
        return $uniqueId == '' ?
            ($this->dao->value(['id' => $productId], 'stock') ?: 0)
            : $StoreProductAttrValue->uniqueByStock($uniqueId);
    }

    /**
     * 减库存,加销量
     * @param $num
     * @param $productId
     * @param string $unique
     * @return bool
     */
    public function decProductStock(int $num, int $productId, string $unique = '')
    {
        $res = true;
        if ($unique) {
            /** @var StoreProductAttrValueServices $skuValueServices */
            $skuValueServices = app()->make(StoreProductAttrValueServices::class);
            $res = $res && $skuValueServices->decProductAttrStock($productId, $unique, $num, 0);
        }
        return $res && $this->dao->decStockIncSales(['id' => $productId], $num);
    }

    /**
     * 加销量减库存
     * @param int $num
     * @param int $productId
     * @param string $unique
     * @return bool
     */
    public function incProductStock(int $num, int $productId, string $unique = '')
    {
        $res = true;
        if ($unique) {
            /** @var StoreProductAttrValueServices $skuValueServices */
            $skuValueServices = app()->make(StoreProductAttrValueServices::class);
            $res = $res && $skuValueServices->incProductAttrStock($productId, $unique, $num);
        }
        $res = $res && $this->dao->incStockDecSales(['id' => $productId], $num);
        return $res;
    }

    /**
     * 库存预警发送消息
     * @param int $productId
     */
    public function workSendStock(int $productId)
    {
        $stock = $this->dao->value(['id' => $productId], 'stock');
        $replenishment_num = sys_config('store_stock') ?? 0; //库存预警界限
        if ($replenishment_num >= $stock) {
            try {
                \crmeb\services\workerman\ChannelService::instance()->send('STORE_STOCK', ['id' => $productId]);
            } catch (\Exception $e) {
            }
        }
    }

    /**
     * 获取首页推荐商品（多个）
     * @param int $uid
     * @param array $fields
     * @param bool $is_num
     * @param string $type
     * @return array[]
     */
    public function getRecommendProductArr(int $uid, array $fields, bool $is_num = true, string $type = 'mid')
    {
        $baseList = $firstList = $benefitList = $hotList = [];
        $data = [$baseList, $firstList, $benefitList, $hotList];
        if ($fields) {
            $pinkIdsList = false;
            if (count($fields) > 1) {
                /** @var StoreCombinationServices $storeCombinationServices */
                $storeCombinationServices = app()->make(StoreCombinationServices::class);
                $pinkIdsList = $storeCombinationServices->getPinkIdsArray([], ['id']);
            }
            [$page, $limit] = $this->getPageValue();
            foreach ($fields as $field) {
                $list = [];
                switch ($field) {
                    case 'is_best': //精品推荐
                        $k = 0;
                        if ($is_num) {
                            $bastNumber = (int)sys_config('bast_number', 0); //TODO 精品推荐个数
                            $list = $bastNumber ? $list = $this->dao->getRecommendProduct($where, $field, $bastNumber, $page, $limit) : [];
                        } else {
                            $list = $this->dao->getRecommendProduct($where, $field, 0, $page, $limit);
                        }
                        break;
                    case 'is_new': //首发新品
                        $k = 1;
                        if ($is_num) {
                            $firstNumber = (int)sys_config('first_number', 0); //TODO 首发新品个数
                            $list = $firstNumber ? $list = $this->dao->getRecommendProduct($where, $field, $firstNumber, $page, $limit) : [];
                        } else {
                            $list = $this->dao->getRecommendProduct($where, $field, 0, $page, $limit);
                        }
                        break;
                    case 'is_benefit': //首页促销单品
                        $k = 2;
                        if ($is_num) {
                            $promotionNumber = (int)sys_config('promotion_number', 0); //TODO 首发新品个数
                            $list = $promotionNumber ? $list = $this->dao->getRecommendProduct($where, $field, $promotionNumber, $page, $limit) : [];
                        } else {
                            $list = $this->dao->getRecommendProduct($where, $field, 0, $page, $limit);
                        }
                        break;
                    case 'is_hot': //热门榜单
                        $k = 3;
                        $hotNumber = $is_num ? 3 : 0;
                        $list = $this->dao->getRecommendProduct($where, $field, $hotNumber, $page, $limit);
                        break;
                }
                if ($list) {
                    $list = get_thumb_water($list, $type);
                    $list = $this->getActivityList($list, true, $pinkIdsList);
                }
                if (isset($k)) $data[$k] = $list;
            }
        }
        return $data;
    }

    /**
     * 单个获取首页推荐商品
     * @param int $uid
     * @param $field
     * @param int $num
     * @param string $type
     * @return array|array[]
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getRecommendProduct(int $uid, $field, int $num = 0, string $type = 'mid')
    {
        [$page, $limit] = $this->getPageValue();
        $list = $this->dao->getRecommendProduct($where, $field, $num, $page, $limit);
        if ($list) {
            $list = get_thumb_water($list, $type);
            $list = $this->getActivityList($list);
        }
        return $list;
    }

    /**
     * 商品名称 图片
     * @param array $productIds
     * @return array
     */
    public function getProductArray(array $where, string $field, string $key)
    {
        return $this->dao->getColumn($where, $field, $key);
    }

    /**
     * 获取商品详情
     * @param int $productId
     * @param string $field
     * @param array $with
     * @return array|\think\Model|null
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProductInfo(int $productId, string $field = '*', array $with = [])
    {
        return $this->dao->getOne(['is_del' => 0, 'is_show' => 1, 'id' => $productId], $field, $with);
    }

    /** 生成商品复制口令关键字
     * @param int $productId
     * @return string
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getProductWords(int $productId)
    {
        $productInfo = $this->dao->getOne(['is_del' => 0, 'is_show' => 1, 'id' => $productId]);
        $keyWords = "";
        if ($productInfo) {
            $oneKey = "crmeb-fu致文本 Http:/ZБ";
            $twoKey = "Б轉移至☞" . sys_config('site_name') . "☜";
            $threeKey = "【" . $productInfo['store_name'] . "】";
            $mainKey = base64_encode($productId);
            $keyWords = $oneKey . $mainKey . $twoKey . $threeKey;
        }
        return $keyWords;
    }

    /**
     * 通过商品id获取商品分类
     * @param array $productId
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function productIdByProductCateName(array $productId)
    {
        $data = $this->dao->productIdByCateId($productId);
        $cateData = [];
        foreach ($data as $item) {
            $cateData[$item['id']] = implode(',', array_map(function ($i) {
                return $i['cate_name'];
            }, $item['cateName']));
        }
        return $cateData;
    }

    /**
     * 获取预售列表
     * @param $where
     * @return mixed
     */
    public function getAdvanceList($where)
    {
        [$page, $limit] = $this->getPageValue();
        $data = $this->dao->getAdvanceList($where, $page, $limit);
        foreach ($data['list'] as &$item) {
        }
        return $data;
    }

    /**
     * 商品分享二维码 推广员
     * @param int $id
     * @param string $userType
     * @param $user
     * @return mixed|string
     */
    public function getCode(int $id, string $userType, $user)
    {
        if (!$id || !$this->isValidProduct($id, 'id')) {
            throw new ApiException('商品不存在');
        }
        if ($userType == 'routine') {
            /** @var QrcodeServices $qrcodeService */
            $qrcodeService = app()->make(QrcodeServices::class);
            $url = $qrcodeService->getRoutineQrcodePath($id, $user['uid'], 0, ['is_promoter' => $user['is_promoter']]);
            if (!$url) {
                throw new ApiException('二维码生成失败');
            } else {
                if ($url == 'unpublished') throw new ApiException('小程序尚未发布,无法生成商品海报');
                return $url;
            }
        }
        return '';
    }

    /**
     * 商品批量设置
     * @param $data
     * @return bool
     * @throws \Exception
     */
    public function batchSetting($data)
    {
        $ids = $data['ids'];
        $batchData = [];
        if (!count($ids)) throw new AdminException('请选择商品');
        switch ($data['type']) {
            case 1: // 修改分类
                $cate_id = $data['cate_id'];
                if (!count($cate_id)) throw new AdminException('请选择分类');
                /** @var StoreCategoryServices $storeCategoryServices */
                $storeCategoryServices = app()->make(StoreCategoryServices::class);
                $cateGory = $storeCategoryServices->getColumn([['id', 'IN', $cate_id]], 'id,pid', 'id');
                if (!$cateGory) throw new AdminException('分类不存在');
                $time = time();
                $cateData = [];
                foreach ($cate_id as $cid) {
                    if ($cid && isset($cateGory[$cid]['pid'])) {
                        foreach ($ids as $product_id) {
                            $cateData[$product_id][] = ['product_id' => $product_id, 'cate_id' => $cid, 'cate_pid' => $cateGory[$cid]['pid'], 'status' => 1, 'add_time' => $time];
                        }
                    }
                }
                /** @var StoreProductCateServices $storeProductCateServices */
                $storeProductCateServices = app()->make(StoreProductCateServices::class);
                foreach ($ids as $product_id) {
                    $storeProductCateServices->change($product_id, $cateData[$product_id]);
                    $this->dao->update($product_id, ['cate_id' => implode(',', $cate_id)]);
                }
                break;
            case 2:
                foreach ($ids as $product_id) {
                    if ($this->dao->value(['id' => $product_id], 'virtual_type') == 0) {
                        $batchData[] = [
                            'id' => $product_id,
                            'logistics' => implode(',', $data['logistics']),
                            'freight' => $data['freight'],
                            'postage' => $data['freight'] == 2 ? $data['postage'] : 0,
                            'temp_id' => $data['freight'] == 3 ? $data['temp_id'] : 0
                        ];
                    }
                }
                if (count($batchData)) $this->dao->saveAll($batchData);
                break;
            case 4:
                /** @var StoreProductCouponServices $storeProductCouponServices */
                $storeProductCouponServices = app()->make(StoreProductCouponServices::class);
                foreach ($ids as $product_id) {
                    if (!empty($data['coupon_ids'])) {
                        $storeProductCouponServices->setCoupon($product_id, $data['coupon_ids']);
                    } else {
                        $storeProductCouponServices->delete(['product_id' => $product_id]);
                    }
                }
                break;
            case 5:
                foreach ($ids as $product_id) {
                    $batchData[] = [
                        'id' => $product_id,
                        'label_id' => implode(',', $data['label_id'])
                    ];
                }
                if (count($batchData)) $this->dao->saveAll($batchData);
                break;
            case 6:
                foreach ($ids as $product_id) {
                    $batchData[] = [
                        'id' => $product_id,
                        'is_hot' => in_array('is_hot', $data['recommend']) ? 1 : 0,
                        'is_benefit' => in_array('is_benefit', $data['recommend']) ? 1 : 0,
                        'is_new' => in_array('is_new', $data['recommend']) ? 1 : 0,
                        'is_good' => in_array('is_good', $data['recommend']) ? 1 : 0,
                        'is_best' => in_array('is_best', $data['recommend']) ? 1 : 0
                    ];
                }
                if (count($batchData)) $this->dao->saveAll($batchData);
                break;
            case 9:
                foreach ($ids as $product_id) {
                    $batchData[] = [
                        'id' => $product_id,
                        'label_list' => implode(',', $data['label_list'])
                    ];
                }
                if (count($batchData)) $this->dao->saveAll($batchData);
                break;
            case 10:
                $productVirtualInfo = $this->dao->getColumn(['id' => $ids], 'virtual_type', 'id');
                foreach ($ids as $product_id) {
                    if ($productVirtualInfo[$product_id] == 0) {
                        $batchData[] = [
                            'id' => $product_id,
                            'is_gift' => $data['is_gift'],
                            'gift_price' => $data['gift_price'],
                        ];
                    }
                }
                if (count($batchData)) $this->dao->saveAll($batchData);
                break;
            default:
                return true;
        }
        return true;
    }

    /**
     * 商品迁移导出
     * @param $where
     * @return array
     * @throws \ReflectionException
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/10/9
     */
    public function productExportList($where)
    {
        [$page, $limit] = $this->getPageValue();
        $cateIds = [];
        if (isset($where['cate_id']) && $where['cate_id']) {
            /** @var StoreCategoryServices $storeCategory */
            $storeCategory = app()->make(StoreCategoryServices::class);
            $cateIds = $storeCategory->getColumn(['pid' => $where['cate_id']], 'id');
        }
        if ($cateIds) {
            $cateIds[] = $where['cate_id'];
            $where['cate_id'] = $cateIds;
        }
        $productList = $this->dao->getList($where, $page, $limit);
        $header = [
            '商品编号',
            '商品名称',
            '商品类型',
            '商品分类(一级)',
            '商品分类(二级)',
            '商品单位',
            '商品图片',
            '商品视频',
            '商品详情',
            '已售数量',
            '起购数量',
            '规格类型',
            '规格类型值',
            '规格名称',
            '规格值组合',
            '规格图片',
            '售价',
            '划线价',
            '成本价',
            '库存',
            '重量',
            '体积',
            '商品编码',
            '条形码',
            '商品简介',
            '商品关键字',
            '商品口令'
        ];
        $filename = '商品迁移数据_' . date('YmdHis', time());
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
                    $one_data = [
                        'id' => intval($product_id),
                        'store_name' => $productInfo['store_name'],
                        'virtual_type' => $virtualType[$productInfo['virtual_type']],
                        'cate_name_one' => reset($cateName)['one'] ?? '',
                        'cate_name_two' => reset($cateName)['two'] ?? '',
                        'unit_name' => $productInfo['unit_name'],
                        'slider_image' => implode(';', $productInfo['slider_image']),
                        'video_link' => $productInfo['video_link'],
                        'description' => htmlspecialchars_decode($descriptionArr[$productInfo['id']]),
                        'ficti' => intval($productInfo['ficti']),
                        'min_qty' => intval($productInfo['min_qty']),
                        'spec_type' => intval($productInfo['spec_type']) == 1 ? '多规格' : '单规格',
                        'sku_type_value' => $attrString,
                        'sku_name' => implode(',', $value['detail']),
                        'sku_value' => implode(';', array_map(function ($key, $value) {
                            return "$key=$value";
                        }, array_keys($skuArr), $skuArr)),
                        'pic' => $value['pic'],
                        'price' => floatval($value['price']),
                        'ot_price' => floatval($value['ot_price']),
                        'cost' => floatval($value['cost']),
                        'stock' => intval($value['stock']),
                        'volume' => intval($value['volume'] ?? 0),
                        'weight' => intval($value['weight'] ?? 0),
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

    public function productImport($file)
    {
        $all = $success = $fail = 0;
        $file = public_path() . substr($file, 1);
        // 获取文件后缀
        $suffix = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (!in_array($suffix, ['xls', 'xlsx'])) {
            return app('json')->fail('文件格式不正确，请上传xls或xlsx格式的文件！');
        }
        $importData = app()->make(FileService::class)->readExcel($file, 'product', 1, ucfirst($suffix));
        if (!$importData) {
            throw new AdminException('导入数据为空');
        }
        $productCateServices = app()->make(StoreCategoryServices::class);
        $productData = $issetProductArr = [];
        $virtualType = ['普通商品' => 0, '卡密/网盘' => 1, '优惠券' => 2, '虚拟商品' => 3];
        $productAttrValueServices = app()->make(StoreProductAttrValueServices::class);
        $barCodeArr = array_unique($productAttrValueServices->getColumn(['type' => 0], 'bar_code', 'id'));
        $barCodeNumberArr = array_unique($productAttrValueServices->getColumn(['type' => 0], 'bar_code_number', 'id'));
        foreach ($importData as $sku) {
            if ($sku['id'] == null) continue;
            if (!isset($productData[$sku['id']])) {
                $productData[$sku['id']]['disk_info'] = '';
                $productData[$sku['id']]['logistics'] = [1, 2];
                $productData[$sku['id']]['freight'] = 2;
                $productData[$sku['id']]['postage'] = 0;
                $productData[$sku['id']]['recommend'] = [];
                $productData[$sku['id']]['presale'] = 0;
                $productData[$sku['id']]['is_limit'] = 0;
                $productData[$sku['id']]['limit_type'] = 0;
                $productData[$sku['id']]['limit_num'] = 0;
                $productData[$sku['id']]['video_open'] = $sku['video_link'] != '' ? 1 : 0;
                $productData[$sku['id']]['custom_form'] = [];
                $productData[$sku['id']]['store_name'] = $sku['store_name'];
                $productData[$sku['id']]['cate_id'] = $productCateServices->getCateId($sku['cate_name_one'] ?? '', $sku['cate_name_two'] ?? '');
                $productData[$sku['id']]['keyword'] = $sku['keyword'] ?? '';
                $productData[$sku['id']]['unit_name'] = $sku['unit_name'] ?? '';
                $productData[$sku['id']]['store_info'] = $sku['store_info'] ?? '';
                $productData[$sku['id']]['image'] = '';
                $productData[$sku['id']]['recommend_image'] = '';
                $productData[$sku['id']]['slider_image'] = explode(';', $sku['slider_image']);
                $productData[$sku['id']]['description'] = $sku['description'] ?? '';
                $productData[$sku['id']]['ficti'] = $sku['ficti'] ?? 0;
                $productData[$sku['id']]['sort'] = 0;
                $productData[$sku['id']]['is_show'] = 0;
                $productData[$sku['id']]['is_hot'] = 0;
                $productData[$sku['id']]['is_benefit'] = 0;
                $productData[$sku['id']]['is_best'] = 0;
                $productData[$sku['id']]['is_new'] = 0;
                $productData[$sku['id']]['is_good'] = 0;
                $productData[$sku['id']]['is_postage'] = 0;
                $productData[$sku['id']]['is_sub'] = [];
                $productData[$sku['id']]['recommend_list'] = [];
                $productData[$sku['id']]['virtual_type'] = $virtualType[$sku['virtual_type']];
                $productData[$sku['id']]['spec_type'] = $sku['spec_type'] == '多规格' ? 1 : 0;
                $productData[$sku['id']]['is_virtual'] = 0;
                $productData[$sku['id']]['video_link'] = is_null($sku['video_link']) ? '' : $sku['video_link'];
                $productData[$sku['id']]['temp_id'] = '';
                $productData[$sku['id']]['activity'] = ['默认', '拼团'];
                $productData[$sku['id']]['couponName'] = [];
                $productData[$sku['id']]['coupon_ids'] = [];
                $productData[$sku['id']]['command_word'] = $sku['command_word'] ?? '';
                $productData[$sku['id']]['min_qty'] = $sku['min_qty'];
                $productData[$sku['id']]['type'] = 0;
                $productData[$sku['id']]['is_copy'] = 0;
                $productData[$sku['id']]['label_id'] = [];
                $productData[$sku['id']]['params_list'] = [];
                $productData[$sku['id']]['label_list'] = [];
                $productData[$sku['id']]['protection_list'] = [];
            }
            $detail = [];
            foreach (explode(';', $sku['sku_value']) as $pair) {
                list($key, $value) = explode('=', $pair);
                $detail[$key] = $value;
            }
            if ($sku['bar_code'] != '' && in_array($sku['bar_code'], $barCodeArr)) {
                $issetProductArr[] = $sku['id'];
            }
            if ($sku['bar_code_number'] != '' && in_array($sku['bar_code_number'], $barCodeNumberArr)) {
                $issetProductArr[] = $sku['id'];
            }
            $productData[$sku['id']]['attrs'][] = [
                'attr_arr' => explode(',', $sku['sku_name']),
                'detail' => $detail,
                'price' => $sku['price'],
                'pic' => $sku['pic'],
                'ot_price' => $sku['ot_price'] ?? 0,
                'cost' => $sku['cost'],
                'stock' => $sku['stock'],
                'is_show' => 1,
                'is_default_select' => 0,
                'is_virtual' => 0,
                'brokerage' => 0,
                'brokerage_two' => 0,
                'vip_price' => 0,
                'vip_proportion' => 0,
                'unique' => '',
                'weight' => $sku['weight'],
                'volume' => $sku['volume'],
                'bar_code' => $sku['bar_code'],
                'bar_code_number' => $sku['bar_code_number'],
            ];
            $items = [];
            $pairs = explode(';', $sku['sku_type_value']);
            foreach ($pairs as $pair) {
                // 将每个部分按等号分割成 key 和 value
                list($key, $values) = explode('=', $pair);
                // 将 value 部分按逗号分割为数组
                $detailArray = explode(',', $values);
                $detail = [];
                foreach ($detailArray as &$det) {
                    $detail[] = [
                        'value' => $det,
                        'pic' => '',
                    ];
                }
                // 重新构建原始数组的结构
                $items[] = [
                    'value' => $key,
                    'detail' => $detail
                ];
            }
            $productData[$sku['id']]['items'] = $items;
        }
        $all = count($productData);
        foreach (array_unique($issetProductArr) as $issetProduct) {
            if (isset($productData[$issetProduct])) {
                unset($productData[$issetProduct]);
            }
        }
        $success = count($productData);
        $jump = $all - $success;
        foreach ($productData as $info) {
            $this->save(0, $info);
        }
        $fail = 0;
        return compact('all', 'success', 'jump', 'fail');
    }

    /**
     * 真实价格
     * @param $uid
     * @param $id
     * @param $unique
     * @return array
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2025/2/5
     */
    public function realPrice($uid, $id, $unique)
    {
        $realPrice = $price = 0;
        $attrInfo = app()->make(StoreProductAttrValueServices::class)->get(['unique' => $unique, 'product_id' => $id, 'type' => 0], ['price', 'ot_price']);
        $attrInfo = $attrInfo->toArray();
        $realPrice = $price = $attrInfo['price'];
        $otPrice = $attrInfo['ot_price'];
        /** @var StoreProductServices $storeProductService */
        $storeProductService = app()->make(StoreProductServices::class);
        /** @var StoreCategoryServices $storeCategoryService */
        $storeCategoryService = app()->make(StoreCategoryServices::class);
        $cateId = $storeProductService->value(['id' => $id], 'cate_id');
        $cateId = explode(',', (string)$cateId);
        $cateId = array_merge($cateId, $storeCategoryService->cateIdByPid($cateId));
        $cateId = array_diff($cateId, [0]);
        $list = app()->make(StoreCouponIssueServices::class)->getPcIssueCouponList($uid, $cateId, $id);
        usort($list, function ($a, $b) {
            return $b['coupon_price'] - $a['coupon_price'];
        });
        $time = time();
        foreach ($list as $item) {
            // 优惠券不在使用时间范围内
            if ($item['start_use_time'] != 0 && ($item['start_use_time'] > $time || $item['end_use_time'] < $time)) {
                continue;
            }
            // 会员券随付费会员一并下架
            if ($item['receive_type'] == 4) {
                continue;
            }
            // 判断用户是否还能领取或者已经领取未使用
            if ($uid) {
                $canUserCoupon = app()->make(StoreCouponUserServices::class)->getUserCouponCanUse($uid, $item['id'], $item['receive_limit']);
                if (!$canUserCoupon) {
                    continue;
                }
            }
            // 满足优惠券使用门槛
            if ($realPrice >= $item['use_min_price']) {
                $realPrice = bcsub($realPrice, $item['coupon_price'], 2);
                if ($realPrice < 0) $realPrice = 0;
                break;
            }
        }
        return ['real_price' => $realPrice, 'price' => $price, 'is_vip' => 0, 'product_is_vip' => 0, 'member_price' => 0, 'level_price' => 0, 'user_is_member' => 0, 'ot_price' => $otPrice];
    }

    /**
     * 批量移动回收站
     * @param $ids
     * @return bool
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2025/6/18
     */
    public function batchDelete($ids)
    {
        $passNum = 0;
        foreach ($ids as $id) {
            //删除商品检测是否有参与活动
            $res = $this->checkActivity($id, true);
            if ($res) {
                $data['is_del'] = 1;
                $data['is_show'] = 0;
                $this->dao->update($id, $data);
                app()->make(StoreProductCateServices::class)->update(['product_id' => $id], ['status' => 0]);
                app()->make(StoreCartServices::class)->changeStatus($id, 0);
            } else {
                $passNum++;
            }
        }
        return $passNum ? $passNum . '件商品参与活动无法移到回收站，其他商品移动回收站成功' : '移动回收站成功';
    }

    public function batchRecover($ids)
    {
        foreach ($ids as $id) {
            $data['is_del'] = 0;
            $this->dao->update($id, $data);
            app()->make(StoreProductCateServices::class)->update(['product_id' => $id], ['status' => 1]);
        }
        return true;
    }

    /**
     * 自定义组件-商品
     * @param $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2026/1/13
     */
    public function getThemeProduct($where)
    {
        $sort = $where['sort'] ? 'asc' : 'desc';
        switch ($where['order']) {
            case 0:
                $order = 'sales ' . $sort;
                break;
            case 1:
                $order = 'price ' . $sort;
                break;
            default:
                $order = 'sort desc';
                break;
        }
        $limit = $where['ids'] == '' ? (int)$where['limit'] : 1000;
        $list = $this->dao->getThemeProduct($where, $order, $limit);
        foreach ($list as &$item) {
            $item['cate_name'] = $item['cateName'][0]['cate_name'];
            unset($item['cateName']);
        }
        if ($where['ids'] == '') return $list;
        // 将$list转换为以id为键的数组
        $list = array_column($list, null, 'id');
        $data = [];
        // 遍历where中的ids，按顺序取出对应商品
        foreach (explode(',', $where['ids']) as $id) {
            if (isset($list[$id])) {
                $data[] = $list[$id];
            }
        }
        return $data;
    }
}
