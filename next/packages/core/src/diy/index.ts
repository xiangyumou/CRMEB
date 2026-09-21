/**
 * `@shop/core/diy` — 页面装修.
 *
 * The public face of the domain. Another domain reaches the decorated pages
 * through this file and never through the repos.
 *
 * | Function              | Caller | When                                                      |
 * | --------------------- | ------ | --------------------------------------------------------- |
 * | `getHomePage`         | H      | the app's first screen — `GET /api/v1/diy/pages/home`      |
 * | `getStorefrontPage`   | H      | any other decorated page, by id                            |
 * | `getPageVersion`      | H      | the cheap poll on resume, before re-downloading a page     |
 * | `getActiveTheme`      | H      | the colour tokens the renderer applies globally            |
 * | `cleanDiyData`        | H      | only if a page is read outside these functions; they clean |
 * | `isRemovedStorefrontPage` | F2 | when deciding whether a link target still exists           |
 *
 * Every function here takes `(ctx, input)`: nothing in this domain participates
 * in another domain's transaction, because a decorated page is never written
 * as part of an order, a payment or a registration.
 *
 * The four storefront reads already run `cleanDiyData`, so a caller never has
 * to. They are also the only functions safe to call without an admin session;
 * everything else asserts a `diy:*` permission.
 */

export { diyPermissions } from './permissions';

export { cleanDiyData, isRemovedDiyComponent, isRemovedStorefrontPage } from './compatibility';

export {
  assertProductLimits,
  contentVersionOf,
  countComponents,
  nextContentVersion,
  dehydrateDiyContent,
  validateDiyContent,
  versionOf,
  DIY_PRODUCT_LIMIT,
} from './content';

export {
  copyPage,
  createPage,
  deletePage,
  getHomePage,
  getPage,
  getPageVersion,
  getStorefrontPage,
  listPages,
  publishPage,
  restorePageDefault,
  savePageAsDefault,
  savePageContent,
  setHomePage,
  updatePage,
  type DiyPageListInput,
  type ReadCtx,
} from './diy-page.service';

export { activateTheme, getActiveTheme, listThemes, updateTheme } from './theme.service';

export {
  createLink,
  deleteLink,
  listLinkCategories,
  listLinks,
  updateLink,
  type DiyLinkUpdateInput,
} from './link.service';
