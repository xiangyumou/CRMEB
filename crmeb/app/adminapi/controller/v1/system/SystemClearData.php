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
namespace app\adminapi\controller\v1\system;


use app\services\product\product\StoreDescriptionServices;
use app\services\product\product\StoreProductCateServices;
use app\services\product\product\StoreProductCouponServices;
use app\services\product\product\StoreProductReplyServices;
use app\services\product\sku\StoreProductAttrResultServices;
use app\services\product\sku\StoreProductAttrServices;
use app\services\product\sku\StoreProductAttrValueServices;
use think\facade\App;
use app\adminapi\controller\AuthController;
use app\services\system\SystemClearServices;
use app\services\product\product\StoreProductServices;
use app\services\system\attachment\SystemAttachmentServices;


/**
 * 清除默认数据理控制器
 * Class SystemClearData
 * @package app\admin\controller\system
 */
class SystemClearData extends AuthController
{
    /**
     * 构造方法
     * SystemClearData constructor.
     * @param App $app
     * @param SystemClearServices $services
     */
    public function __construct(App $app, SystemClearServices $services)
    {
        parent::__construct($app);
        $this->services = $services;
    }

    /**
     * 统一方法
     * @param $type
     * @return mixed
     */
    public function index($type)
    {
        switch ($type) {
            case 'temp':
                return $this->userTemp();
            case 'recycle':
                return $this->recycleProduct();
            case 'store':
                return $this->storeData();
            case 'category':
                return $this->categoryData();
            case 'order':
                return $this->orderData();
            case 'wechat':
                return $this->wechatData();
            case 'article':
                return $this->articleData();
            case 'attachment':
                return $this->attachmentData();
            case 'system':
                return $this->systemData();
            case 'user':
                return $this->userRelevantData();
            default:
                return app('json')->fail('参数错误');
        }
    }

    /**
     * 清除用户生成的临时附件
     * @return mixed
     */
    public function userTemp()
    {
        /** @var SystemAttachmentServices $services */
        $services = app()->make(SystemAttachmentServices::class);
        $imageUrl = $services->getColumn(['module_type' => 2], 'att_dir');
        foreach ($imageUrl as $item) {
            @unlink(app()->getRootPath() . 'public' . $item);
        }
        $services->delete(2, 'module_type');
        $this->services->clearData(['qrcode'], true);
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除回收站商品
     * @return mixed
     */
    public function recycleProduct($id = 0)
    {
        /** @var StoreProductServices $product */
        $product = app()->make(StoreProductServices::class);
        if ($id) {
            $ids = [$id];
        } else {
            $ids = $product->getColumn(['is_del' => 1], 'id');
        }
        //清除规格表数据
        /** @var StoreProductAttrServices $ProductAttr */
        $productAttr = app()->make(StoreProductAttrServices::class);
        $productAttr->delete([['product_id', 'in', $ids], ['type', '=', '0']]);

        /** @var StoreProductAttrResultServices $productAttrResult */
        $productAttrResult = app()->make(StoreProductAttrResultServices::class);
        $productAttrResult->delete([['product_id', 'in', $ids], ['type', '=', '0']]);

        /** @var StoreProductAttrValueServices $productAttrValue */
        $productAttrValue = app()->make(StoreProductAttrValueServices::class);
        $productAttrValue->delete([['product_id', 'in', $ids], ['type', '=', '0']]);

        //删除商品详情
        /** @var StoreDescriptionServices $productDescription */
        $productDescription = app()->make(StoreDescriptionServices::class);
        $productDescription->delete([['product_id', 'in', $ids], ['type', '=', '0']]);

        //删除商品关联分类数据
        /** @var StoreProductCateServices $productCate */
        $productCate = app()->make(StoreProductCateServices::class);
        $productCate->delete([['product_id', 'in', $ids]]);

        //删除商品关联优惠券数据
        /** @var StoreProductCouponServices $productCoupon */
        $productCoupon = app()->make(StoreProductCouponServices::class);
        $productCoupon->delete([['product_id', 'in', $ids]]);

        //删除商品收藏记录
        /** @var StoreProductReplyServices $productRelation */
        $productRelation = app()->make(StoreProductReplyServices::class);
        $productRelation->delete([['product_id', 'in', $ids], ['reply_type', '=', 'product']]);

        //删除商品的评论
        /** @var StoreProductReplyServices $productReply */
        $productReply = app()->make(StoreProductReplyServices::class);
        $productReply->delete([['product_id', 'in', $ids]]);

        /** @var StoreProductServices $services */
        $services = app()->make(StoreProductServices::class);
        if ($id) {
            $services->delete($id);
            return true;
        } else {
            $services->delete(1, 'is_del');
            return app('json')->success('清除数据成功');
        }
    }

    /**
     * 清除用户数据
     * @return mixed
     */
    public function userRelevantData()
    {
        $this->services->clearData([
            'capital_flow',
            'qrcode',
            'sms_record',
            'store_cart',
            'store_coupon_issue_user',
            'store_coupon_user',
            'store_order',
            'store_order_cart_info',
            'store_order_invoice',
            'store_order_refund',
            'store_order_status',
            'store_pink',
            'store_product_relation',
            'store_product_reply',
            'store_visit',
            'user',
            'user_address',
            'user_bill',
            'user_cancel',
            'user_group',
            'user_invoice',
            'user_label',
            'user_label_relation',
            'user_search',
            'user_visit',
            'wechat_user',
        ], true);
        $this->services->delDirAndFile('./public/uploads/store/comment');
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除商城数据
     * @return mixed
     */
    public function storeData()
    {
        $this->services->clearData([
            'article',
            'article_category',
            'article_content',
            'auxiliary',
            'cache',
            'capital_flow',
            'category',
            'message_system',
            'qrcode',
            'sms_record',
            'store_advance',
            'store_cart',
            'store_category',
            'store_combination',
            'store_coupon_issue',
            'store_coupon_issue_user',
            'store_coupon_product',
            'store_coupon_user',
            'store_order',
            'store_order_cart_info',
            'store_order_invoice',
            'store_order_refund',
            'store_order_status',
            'store_pink',
            'store_product',
            'store_product_attr',
            'store_product_attr_result',
            'store_product_attr_value',
            'store_product_cate',
            'store_product_coupon',
            'store_product_description',
            'store_product_log',
            'store_product_relation',
            'store_product_reply',
            'store_product_rule',
            'store_product_virtual',
            'store_visit',
            'system_file',
            'system_log',
            'user',
            'user_address',
            'user_bill',
            'user_cancel',
            'user_group',
            'user_invoice',
            'user_label',
            'user_label_relation',
            'user_search',
            'user_visit',
            'wechat_key',
            'wechat_media',
            'wechat_message',
            'wechat_news_category',
            'wechat_qrcode',
            'wechat_qrcode_cate',
            'wechat_qrcode_record',
            'wechat_reply',
            'wechat_user',
        ], true);
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除商品分类
     * @return mixed
     */
    public function categoryData()
    {
        $this->services->clearData(['store_category'], true);
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除订单数据
     * @return mixed
     */
    public function orderData()
    {
        $this->services->clearData([
            'store_cart',
            'store_order',
            'store_order_cart_info',
            'store_order_invoice',
            'store_order_refund',
            'store_order_status',
            'store_pink',
        ], true);
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除微信管理数据
     * @return mixed
     */
    public function wechatData()
    {
        $this->services->clearData([
            'cache',
            'wechat_key',
            'wechat_media',
            'wechat_message',
            'wechat_news_category',
            'wechat_qrcode',
            'wechat_qrcode_cate',
            'wechat_qrcode_record',
            'wechat_reply',
        ], true);
        $this->services->delDirAndFile('./public/uploads/wechat');
        return app('json')->success('清除数据成功');
    }

    /**
     * 清除所有附件
     * @return mixed
     */
    public function attachmentData()
    {
        $this->services->clearData([
            'system_attachment',
            'system_attachment_category',
        ], true);
        $this->services->delDirAndFile('./public/uploads/');
        return app('json')->success('清除数据成功');
    }

    //清除内容分类
    public function articleData()
    {
        $this->services->clearData([
            'article_category',
            'article',
            'article_content',
        ], true);
        return app('json')->success('清除数据成功');
    }

    //清除系统记录
    public function systemData()
    {
        $this->services->clearData([
            'system_log',
        ], true);
        return app('json')->success('清除数据成功');
    }

    /**
     * 替换域名方法
     * @return mixed
     */
    public function replaceSiteUrl()
    {
        list($url) = $this->request->postMore([
            ['url', '']
        ], true);
        if (!$url)
            return app('json')->fail('请输入需要更换的域名');
        if (!verify_domain($url))
            return app('json')->fail('域名不合法');
        $this->services->replaceSiteUrl($url);
        return app('json')->success('替换成功');
    }
}
