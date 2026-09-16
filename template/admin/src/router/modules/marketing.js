// +---------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +---------------------------------------------------------------------
// | Copyright (c) 2016~2023 https://www.crmeb.com All rights reserved.
// +---------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +---------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +---------------------------------------------------------------------

import LayoutMain from '@/layout';
import setting from '@/setting';
let routePre = setting.routePre;

const pre = 'marketing_';

export default {
  path: routePre + '/marketing',
  name: 'marketing',
  header: 'marketing',
  redirect: {
    name: `${pre}storeCouponIssue`,
  },
  component: LayoutMain,
  children: [
    {
      path: 'store_combination/index',
      name: `${pre}combinalist`,
      meta: {
        auth: ['marketing-store_combination'],
        title: '拼团商品',
        keepAlive: true,
      },
      component: () => import('@/pages/marketing/storeCombination/index'),
    },
    {
      path: 'store_combination/combina_list',
      name: `${pre}combinaList`,
      meta: {
        auth: ['marketing-store_combination-combina_list'],
        title: '拼团列表',
      },
      component: () => import('@/pages/marketing/storeCombination/combinaList'),
    },
    {
      path: 'store_combination/create/:id?/:copy?',
      name: `${pre}storeCombinationCreate`,
      meta: {
        auth: ['marketing-store_combination-create'],
        title: '添加拼团',
        activeMenu: routePre + '/marketing/store_combination/index',
      },
      component: () => import('@/pages/marketing/storeCombination/create'),
    },
    {
      path: 'store_combination/statistics/:id?',
      name: `${pre}storeCombinationStatistics`,
      meta: {
        title: '拼团统计',
        activeMenu: routePre + '/marketing/store_combination/index',
      },
      component: () => import('@/pages/marketing/storeCombination/statistics'),
    },
    {
      path: 'store_coupon/index',
      name: `${pre}storeCoupon`,
      meta: {
        auth: ['marketing-store_coupon'],
        title: '优惠券模板',
      },
      component: () => import('@/pages/marketing/storeCoupon/index'),
    },
    {
      path: 'store_coupon_issue/index',
      name: `${pre}storeCouponIssue`,
      meta: {
        auth: ['marketing-store_coupon_issue'],
        title: '优惠券列表',
        keepAlive: true,
      },
      component: () => import('@/pages/marketing/storeCouponIssue/index'),
    },
    {
      path: 'store_coupon_issue/create/:id?/:edit?',
      name: `${pre}storeCouponCreate`,
      meta: {
        auth: ['marketing-store_coupon_issue-create'],
        title: '添加优惠券',
        activeMenu: routePre + '/marketing/store_coupon_issue/index',
      },
      component: () => import('@/pages/marketing/storeCouponIssue/create'),
    },
    {
      path: 'store_coupon_user/index',
      name: `${pre}storeCouponUser`,
      meta: {
        auth: ['marketing-store_coupon_user'],
        title: '用户领取记录',
      },
      component: () => import('@/pages/marketing/storeCouponUser/index'),
    },
    {
      path: 'coupon/system_config/:type?/:tab_id?',
      name: `${pre}coupon`,
      meta: {
        auth: ['admin-order-storeOrder-index'],
        title: '优惠券配置',
      },
      component: () => import('@/pages/setting/setSystem/index'),
    },





    {
      path: 'store_seckill_data/index/:id',
      name: `${pre}storeSeckillData`,
      meta: {
        auth: ['marketing-store_seckill-data'],
        title: '秒杀配置',
      },
      component: () => import('@/pages/system/group/list'),
    },





    {
      path: `model/system_config/:type?/:tab_id?`,
      name: `${pre}model`,
      meta: {
        auth: ['system-model-system_config'],
        title: '模块配置',
      },
      component: () => import('@/pages/setting/setSystem/index'),
    },


    {
      path: 'store_integral/order_list',
      name: `${pre}storeIntegralOrder`,
      meta: {
        auth: ['marketing-store_integral-order'],
        title: '兑换订单',
      },
      component: () => import('@/pages/marketing/storeIntegralOrder/index'),
    },






    {
      path: 'presell/index',
      name: `${pre}storePresell`,
      meta: {
        auth: ['marketing-presell'],
        title: '预售商品',
      },
      component: () => import('@/pages/marketing/storePresell/index'),
    },
    {
      path: 'presell/presell_list',
      name: `${pre}presellList`,
      meta: {
        auth: ['marketing-presell-presell_list'],
        title: '预售列表',
      },
      component: () => import('@/pages/marketing/storePresell/presellList'),
    },
    {
      path: 'presell/create/:id?/:copy?',
      name: `${pre}storePresellCreate`,
      meta: {
        auth: ['marketing-presell-create'],
        title: '添加预售',
      },
      component: () => import('@/pages/marketing/storePresell/create'),
    },





    {
      path: 'channel_code/channelCodeIndex',
      name: `${pre}channel_code`,
      meta: {
        auth: true,
        title: '公众号渠道码',
        keepAlive: true,
      },
      component: () => import('@/pages/marketing/channelCode/channelCodeIndex'),
    },
    {
      path: 'channel_code/create',
      name: `${pre}create_code`,
      meta: {
        auth: ['marketing-channel_code-create'],
        title: '渠道码',
        activeMenu: routePre + '/marketing/channel_code/channelCodeIndex',
      },
      component: () => import('@/pages/marketing/channelCode/createCode'),
    },
    {
      path: 'channel_code/code_statistic',
      name: `${pre}code_statistic`,
      meta: {
        auth: ['marketing-channel_code-statistic'],
        title: '二维码统计',
        activeMenu: routePre + '/marketing/channel_code/channelCodeIndex',
      },
      component: () => import('@/pages/marketing/channelCode/codeStatistic'),
    },






    {
      path: `newuser/gift`,
      name: `${pre}gift`,
      meta: {
        title: '新人礼',
        auth: ['admin-marketing-new-user-gift'],
      },
      component: () => import('@/pages/marketing/newuser/gift'),
    },
  ],
};
