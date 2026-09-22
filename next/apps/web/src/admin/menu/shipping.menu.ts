import { defineMenu } from './types';

/**
 * 物流 → 运费模板 / 快递公司.
 *
 * The 地区 (city) tree deliberately has no menu entry: it is immutable seed
 * data with no editor, reached only by the region picker inside the 运费模板
 * form. The legacy 城市管理 screen has no successor (see
 * `contracts/src/shipping/shipping.city.contract.ts`).
 */
export default defineMenu({
  key: 'shipping',
  label: '物流',
  icon: 'CarOutlined',
  order: 500,
  children: [
    {
      key: 'shipping.templates',
      label: '运费模板',
      path: '/admin/shipping/templates',
      permission: 'shipping:template:read',
      order: 10,
    },
    {
      key: 'shipping.expressCompanies',
      label: '快递公司',
      path: '/admin/shipping/express-companies',
      permission: 'shipping:express:read',
      order: 20,
    },
  ],
});
