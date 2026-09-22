/**
 * The CMS domain's public surface: 文章 and 文章分类.
 *
 * ## What other streams call
 *
 * | Export             | Caller   | When                                            |
 * | ------------------ | -------- | ----------------------------------------------- |
 * | `articles.*`       | routes   | the admin screens and the storefront reader      |
 * | `categories.*`     | routes   | the same, plus the storefront's tab bar          |
 * | `sanitizeHtml`     | anyone   | storing operator-authored HTML from another form |
 * | `cmsPermissions`   | E1       | the permission tree                              |
 *
 * ## No ports
 *
 * Unlike `shipping`, importing this file registers nothing. The CMS is read by
 * the DIY editor (an article picker and a link target), but that runs in the
 * browser against the published routes — `apps/web/src/admin/cms/link-targets.ts`
 * — so there is no server-side port to install and no import cycle with `diy`.
 *
 * `sanitizeHtml` is exported because it is the only allow-list sanitiser in the
 * workspace: any other domain that ever stores rich text authored by an
 * operator should call this one rather than grow a second policy.
 */

export * as articles from './cms.article.service';
export * as categories from './cms.category.service';
export { isSafeUrl, sanitizeHtml } from './cms.sanitize';
export { cmsPermissions } from './permissions';
