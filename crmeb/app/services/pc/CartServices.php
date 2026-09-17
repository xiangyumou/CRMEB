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
declare (strict_types = 1);

namespace app\services\pc;


use app\services\BaseServices;
use app\services\order\StoreCartServices;
use app\services\product\product\StoreProductServices;
use app\services\system\SystemUserLevelServices;
use app\services\user\member\MemberCardServices;
use app\services\user\UserServices;

class CartServices extends BaseServices
{
    /**
     * PC端购物车列表
     * @param int $uid
     * @return array[]
     */
    public function getCartList(int $uid)
    {
        /** @var StoreCartServices $storeCartServices */
        $storeCartServices = app()->make(StoreCartServices::class);
        $list = $storeCartServices->getCartList(['uid' => $uid], 0, 0, ['productInfo', 'attrInfo']);
        $valid = $invalid = [];
        foreach ($list as &$item) {
            $is_valid = $item['attrInfo']['suk'] ?? 0;
            $item['productInfo']['attrInfo'] = $item['attrInfo'] ?? [];
            $item['productInfo']['attrInfo']['image'] = $item['attrInfo']['image'] ?? $item['productInfo']['image'];
            if (isset($item['productInfo']['attrInfo'])) {
                $item['productInfo']['attrInfo'] = get_thumb_water($item['productInfo']['attrInfo']);
            }
            $item['productInfo'] = get_thumb_water($item['productInfo']);
            $productInfo = $item['productInfo'];
            if (isset($productInfo['attrInfo']['product_id']) && $item['product_attr_unique']) {
                $item['costPrice'] = $productInfo['attrInfo']['cost'] ?? 0;
                $item['trueStock'] = $productInfo['attrInfo']['stock'] ?? 0;
                $item['truePrice'] = $productInfo['attrInfo']['price'] ?? 0;
                $item['vip_truePrice'] = 0;
                $item['price_type'] = 'normal';
            } else {
                $item['costPrice'] = $item['productInfo']['cost'] ?? 0;
                $item['trueStock'] = $item['productInfo']['stock'] ?? 0;
                $item['truePrice'] = $item['productInfo']['price'] ?? 0;
                $item['vip_truePrice'] = 0;
                $item['price_type'] = 'normal';
            }
            unset($item['attrInfo']);
            if ($item['status'] == 1 && $is_valid && $item['trueStock'] > 0) {
                $valid[] = $item;
            } else {
                $invalid[] = $item;
            }
        }
        return ['valid' => $valid, 'invalid' => $invalid];
    }
}
