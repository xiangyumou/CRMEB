import { defineMenu } from './types';

/**
 * 统计.
 *
 * The four pages the legacy admin had twenty routes for. 资金流水 / 账单记录
 * and 余额统计 are not here: balance, recharge, commission, points and paid
 * membership are out of scope shop-wide, and 余额统计 was a menu entry
 * pointing at a route group with nothing in it.
 *
 * `permission` here only decides what the sider shows; the server re-checks
 * the atom declared on each route. Both lists come from `statsPermissions` in
 * `@shop/core/stats/permissions.ts`.
 */
export default defineMenu({
  key: 'stats',
  label: '统计',
  icon: 'BarChartOutlined',
  // Between 物流 (500) and 装修 (700); 统计 is read-only, so it sits after the
  // menus an operator works in and before the ones they configure.
  order: 600,
  children: [
    {
      key: 'stats.trade',
      label: '交易统计',
      path: '/admin/stats/trade',
      permission: 'stats:trade:read',
      order: 10,
    },
    {
      key: 'stats.orders',
      label: '订单统计',
      path: '/admin/stats/orders',
      permission: 'stats:order:read',
      order: 20,
    },
    {
      key: 'stats.products',
      label: '商品统计',
      path: '/admin/stats/products',
      permission: 'stats:product:read',
      order: 30,
    },
    {
      key: 'stats.users',
      label: '用户统计',
      path: '/admin/stats/users',
      permission: 'stats:user:read',
      order: 40,
    },
  ],
});
