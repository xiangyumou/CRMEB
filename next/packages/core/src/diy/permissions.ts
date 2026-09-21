import { definePermissions } from '../auth/permissions';

/**
 * 页面装修.
 *
 * The legacy admin had one coarse `diy` menu permission. Split here because
 * publishing is the dangerous verb: an operator who may rearrange a draft is
 * not necessarily allowed to change what every shopper sees, and "设为首页" and
 * "设为默认数据" are the same kind of act.
 */
export const diyPermissions = definePermissions(
  'diy',
  {
    'page:read': '查看装修页面',
    'page:create': '新建装修页面',
    'page:update': '编辑装修页面',
    'page:delete': '删除装修页面',
    'page:publish': '发布装修页面',
    'theme:read': '查看主题',
    'theme:update': '编辑主题',
    'link:read': '查看页面链接',
    'link:update': '维护页面链接',
  },
  { section: '页面装修' },
);
