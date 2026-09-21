import { defineErrors } from '../_conventions/errors';

/**
 * Page decoration (页面装修).
 *
 * Most of these are the Chinese strings the legacy `AdminException`s threw,
 * kept word for word where the operator already knows them.
 */
export const diyErrors = defineErrors({
  DIY_PAGE_NOT_FOUND: { status: 404, message: '模板不存在' },
  /** `DiyServices::del` — 首页模板 is `id = 1` in the legacy data. */
  DIY_PAGE_UNDELETABLE: { status: 409, message: '首页模板不能删除' },
  DIY_PAGE_IN_USE: { status: 409, message: '该模板使用中，无法删除' },
  /**
   * The saved envelope did not parse against `diy/schema`. `details` carries
   * the offending paths so the editor can point at the component.
   */
  DIY_CONTENT_INVALID: { status: 422, message: '页面数据格式不正确' },
  /**
   * Optimistic concurrency on the editor's save. Two operators decorating the
   * same page used to overwrite one another silently.
   */
  DIY_VERSION_CONFLICT: { status: 409, message: '页面已被其他人修改，请刷新后重新保存' },
  /** `diy_pages_home_is_home_kind` — only a `home` page may be the home page. */
  DIY_HOME_KIND_MISMATCH: { status: 409, message: '只有首页类型的页面可以设为首页' },
  DIY_HOME_PAGE_MISSING: { status: 404, message: '尚未设置首页模板' },
  /** `database.page.limitMax`; the legacy message, unchanged. */
  DIY_COMPONENT_LIMIT_EXCEEDED: { status: 422, message: '您设置的商品个数超出系统限制' },
  DIY_NO_DEFAULT_CONTENT: { status: 404, message: '当前页面还没有保存过默认数据' },
  DIY_THEME_NOT_FOUND: { status: 404, message: '主题不存在' },
  DIY_THEME_BUILT_IN_READONLY: { status: 403, message: '内置主题不可修改' },
  DIY_LINK_NOT_FOUND: { status: 404, message: '页面链接不存在' },
  DIY_LINK_URL_EXISTS: { status: 409, message: '该页面链接已存在' },
  DIY_LINK_CATEGORY_NOT_FOUND: { status: 404, message: '链接分类不存在' },
  DIY_LINK_CATEGORY_NOT_EMPTY: { status: 409, message: '该分类下还有链接，无法删除' },
});

export type DiyErrorCode = keyof typeof diyErrors;
