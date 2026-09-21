import { defineMenu } from './types';

/**
 * 页面装修.
 *
 * The editor itself is `hidden` so it stays out of the sidebar but still gives
 * the breadcrumb a parent — the convention the kit README sets for detail pages.
 */
export default defineMenu({
  key: 'diy',
  label: '页面装修',
  icon: 'BuildOutlined',
  order: 700,
  permission: 'diy:page:read',
  children: [
    {
      key: 'diy.pages',
      label: '页面列表',
      path: '/admin/diy',
      permission: 'diy:page:read',
      order: 10,
    },
    {
      key: 'diy.page',
      label: '装修页面',
      path: '/admin/diy/:id',
      permission: 'diy:page:read',
      order: 20,
      hidden: true,
    },
    {
      key: 'diy.links',
      label: '页面链接',
      path: '/admin/diy/links',
      permission: 'diy:link:read',
      order: 30,
    },
  ],
});
