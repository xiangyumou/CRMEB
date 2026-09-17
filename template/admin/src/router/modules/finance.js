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

const pre = 'finance_';
export default {
  path: routePre + '/finance',
  name: 'finance',
  header: 'finance',
  meta: {
    // 授权标识
    auth: ['admin-finance'],
  },
  redirect: {
    name: `${pre}billingRecords`,
  },
  component: LayoutMain,
  children: [
    {
      path: 'billing_records/index',
      name: `${pre}billingRecords`,
      meta: {
        auth: ['finance-billing_records-index'],
        title: '账单记录',
      },
      component: () => import('@/pages/finance/billingRecords/index'),
    },
    {
      path: 'capital_flow/index',
      name: `${pre}capitalFlow`,
      meta: {
        auth: ['finance-capital_flow-index'],
        title: '资金流水',
      },
      component: () => import('@/pages/finance/capitalFlow/index'),
    },

  ],
};
