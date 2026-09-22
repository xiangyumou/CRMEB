/**
 * Every migration group, in the order they load.
 *
 * The order is a **foreign-key order**, not an alphabet: `catalog` before
 * `coupon`, because a coupon scoped to a product references it; `system` first,
 * because everything that has an "uploaded by" or an "updated by" points at an
 * admin. Getting it wrong shows up as a constraint violation on the first run
 * against a real dump, which is the right time to find out.
 *
 * A group whose mapper has not landed is listed with `mapper: null` and its
 * owner. It is reported as **pending** by `plan`, `run` and `verify`, and
 * `run --require-complete` (the cutover gate) refuses to finish while any
 * group is pending. It is never skipped quietly.
 *
 * Groups that depend on a pending one still run. `catalog` wants the user ids
 * that survived `user`; while `user` is pending it gets an **empty** set, so a
 * favourite of an unknown account is dropped — and *counted by name* in
 * catalog's own report (`favoritesDroppedUnknownUser`). The alternative,
 * refusing to run `catalog` at all, would mean nothing downstream of the first
 * unfinished stream could be rehearsed, and the FK would fail anyway. The
 * report says how much was lost and to which pending group; the cutover run has
 * every group, so nothing is.
 */

import { configMapper } from './config';
import { defineGroup, type ErasedGroup, type GroupContext, type TargetRow } from './mapper';
import { digestFile } from './lib/digest';
import { localFilePath, localPublicUrl } from './lib/storage-keys';
import { mapCatalog } from './mappers/catalog';
import { mapCoupons } from './mappers/coupon';
import { mapDiy } from './mappers/diy';
import { mapStorage } from './mappers/storage';
import { mapSystem } from './mappers/system';
import { mapUsers } from './mappers/user';

// ---------------------------------------------------------------------------
// 1. system — admins and roles. Everything with an "updated by" needs these.
// ---------------------------------------------------------------------------

const system = defineGroup({
  name: 'system',
  title: '后台账号与角色',
  owner: 'F1',
  mapper: mapSystem,
  sources: [
    { table: 'eb_system_admin', into: 'admins' },
    { table: 'eb_system_role', into: 'roles' },
  ],
  // `configValues` is deliberately not a target here: the runner maps config
  // itself, because one legacy key can feed several groups and because
  // validating a value means running a group's zod schema (see config.ts).
  // No `dropColumns` any more: `admins.lastLoginIp` and `roles.deletedAt` were
  // parked here until CR-4-j, and the mapper now simply does not emit them.
  targets: [
    { table: 'admins', from: 'admins' },
    { table: 'roles', from: 'roles' },
    { table: 'admin_roles', from: 'adminRoles' },
  ],
});

// ---------------------------------------------------------------------------
// 2. config — eb_system_config through every group's `legacyKeys`, plus the
//    two 版式 numbers `eb_diy` kept beside the pages.
// ---------------------------------------------------------------------------

const config = defineGroup({
  name: 'config',
  title: '系统配置',
  owner: 'J',
  mapper: configMapper,
  sources: [
    { table: 'eb_system_config', into: 'configs' },
    /**
     * 分类页 / 个人中心 版式 — `diy.categoryLayout` and `diy.userCenterLayout`.
     *
     * Config values whose legacy home happened to be `eb_diy`, so they are read
     * *here* rather than by the `diy` group: `config_values` has one owner, and
     * `run` empties a group's targets before reloading them, so a second group
     * writing this table would wipe every other group's settings on its way
     * past. Filtered to the two rows in SQL — the rest of `eb_diy` is the diy
     * group's business and its `value` column holds whole page payloads.
     * Optional, because a partial dump without the decoration tables is just a
     * shop that keeps the default layouts.
     */
    {
      table: 'eb_diy',
      into: 'diy',
      where: "template_name in ('category', 'member')",
      optional: true,
    },
  ],
  targets: [{ table: 'config_values', from: 'values' }],
  extras: (context) => ({
    now: context.migratedAt,
    allowInvalid: context.allowInvalidConfig,
  }),
});

// ---------------------------------------------------------------------------
// 3. storage — the media library. Needs admins; everything else needs its keys.
// ---------------------------------------------------------------------------

const storage = defineGroup({
  name: 'storage',
  title: '素材库',
  owner: 'F1',
  mapper: mapStorage,
  sources: [
    { table: 'eb_system_attachment_category', into: 'categories' },
    { table: 'eb_system_attachment', into: 'attachments' },
  ],
  targets: [
    { table: 'attachment_categories', from: 'categories' },
    { table: 'attachments', from: 'attachments' },
  ],
  /**
   * The mapper emits `sha256: null` on purpose (ETL-F1-004): the legacy table
   * has no digest, `attachments.sha256` is NOT NULL with a `^[0-9a-f]{64}$`
   * check, and a placeholder would disable dedupe for ever. The digest is the
   * runner's job, because only the runner can read the bytes.
   *
   * A row whose file is not under the uploads root is **dropped and named**.
   * That is the honest outcome: we cannot write the row without a digest and
   * we will not invent one, and a library entry pointing at bytes that did not
   * come across is a broken image either way — better counted than mysterious.
   */
  finalise: async (table, rows, context) => {
    if (table !== 'attachments') return [...rows];
    const kept: TargetRow[] = [];
    let missingFile = 0;
    let unreadable = 0;
    for (const row of rows) {
      if (typeof row['sha256'] === 'string' && row['sha256'] !== '') {
        kept.push(row);
        continue;
      }
      const storageKey = String(row['storageKey'] ?? '');
      const file =
        context.uploadsRoot === null ? null : localFilePath(context.uploadsRoot, storageKey);
      if (file === null) {
        missingFile += 1;
        continue;
      }
      const digest = await digestFile(file);
      if (digest === null) {
        unreadable += 1;
        continue;
      }
      kept.push({ ...row, sha256: digest });
    }
    if (missingFile > 0) {
      context.notes.push(
        `storage: ${String(missingFile)} 个附件没有对应的本地文件（或 --uploads-root 未提供），` +
          `无法计算 sha256，已丢弃并计数——绝不编造摘要（ETL-F1-004）`,
      );
    }
    if (unreadable > 0) {
      context.notes.push(`storage: ${String(unreadable)} 个附件的文件存在但读不出来，已丢弃`);
    }
    return kept;
  },
});

// ---------------------------------------------------------------------------
// 4. user — customers, addresses, groups, labels. Everything customer-facing
//    downstream (favourites, reviews, coupons) filters on the ids it keeps.
// ---------------------------------------------------------------------------

const user = defineGroup({
  name: 'user',
  title: '会员、地址、分组、标签',
  owner: 'E1',
  mapper: mapUsers,
  sources: [
    { table: 'eb_user', into: 'users' },
    { table: 'eb_user_address', into: 'addresses' },
    { table: 'eb_user_group', into: 'groups' },
    { table: 'eb_user_label', into: 'labels' },
    // `eb_user_label_cate` has no CREATE TABLE in the installer dump although
    // `eb_user_label.label_cate` references it, so a real export may or may not
    // have it. Optional: the mapper synthesises the missing categories from the
    // ids the labels actually use, and counts what it invented.
    { table: 'eb_user_label_cate', into: 'labelCategories', optional: true },
    { table: 'eb_user_label_relation', into: 'labelRelations' },
    { table: 'eb_user_cancel', into: 'cancellations', optional: true },
    { table: 'eb_wechat_user', into: 'wechatUsers' },
  ],
  // FK order: a user before anything that points at one, a label category
  // before its labels, and both before the membership rows.
  targets: [
    { table: 'users', from: 'users' },
    { table: 'user_addresses', from: 'addresses' },
    { table: 'user_groups', from: 'groups' },
    { table: 'user_groups_map', from: 'groupMemberships' },
    { table: 'user_label_categories', from: 'labelCategories' },
    { table: 'user_labels', from: 'labels' },
    { table: 'user_labels_map', from: 'labelMemberships' },
    { table: 'user_cancellation_requests', from: 'cancellations' },
    { table: 'wechat_identities', from: 'wechatIdentities' },
  ],
  requiresReference: [
    {
      table: 'cities',
      reason:
        '收货地址的 city_id 指向城市字典。字典不随迁移产生，由 packages/db 的种子数据写入，' +
        '并沿用旧库的 id，所以旧地址可以继续指向同一个城市',
    },
  ],
  // The dictionary itself, so an address pointing at a city the new `cities`
  // table does not have loses the link and is counted, instead of failing the
  // foreign key and rolling back every member, address and label with it
  // (CR-3-j). The seed check above has already run, so this is never empty
  // because somebody forgot `db:seed`.
  extras: async (context) => ({ knownCityIds: await context.idsOf('cities') }),
});

// ---------------------------------------------------------------------------
// 5. shipping — not written yet.
// ---------------------------------------------------------------------------

const shipping = defineGroup<
  { templates?: readonly unknown[] },
  { templates: TargetRow[]; report: object }
>({
  name: 'shipping',
  title: '运费模板',
  owner: 'F2',
  mapper: null,
  sources: [],
  targets: [],
});

// ---------------------------------------------------------------------------
// 6. catalog — the shop itself.
// ---------------------------------------------------------------------------

const catalog = defineGroup({
  name: 'catalog',
  title: '商品、分类、SKU、评价',
  owner: 'A',
  mapper: mapCatalog,
  sources: [
    { table: 'eb_store_category', into: 'categories' },
    { table: 'eb_store_product', into: 'products' },
    { table: 'eb_store_product_cate', into: 'productCategories' },
    { table: 'eb_store_product_attr', into: 'attrs' },
    { table: 'eb_store_product_attr_value', into: 'attrValues' },
    { table: 'eb_store_product_description', into: 'descriptions' },
    { table: 'eb_store_product_virtual', into: 'virtuals' },
    { table: 'eb_store_product_label_cate', into: 'labelCategories' },
    { table: 'eb_store_product_label', into: 'labels' },
    { table: 'eb_store_product_param', into: 'paramTemplates' },
    { table: 'eb_store_product_protection', into: 'protections' },
    { table: 'eb_store_product_relation', into: 'relations' },
    { table: 'eb_store_product_reply', into: 'replies' },
  ],
  targets: [
    { table: 'product_categories', from: 'categories' },
    { table: 'products', from: 'products' },
    { table: 'product_categories_map', from: 'productCategories' },
    { table: 'product_descriptions', from: 'descriptions' },
    { table: 'product_recommendations', from: 'recommendations' },
    { table: 'product_specs', from: 'specs' },
    { table: 'product_spec_values', from: 'specValues' },
    { table: 'product_skus', from: 'skus' },
    { table: 'product_virtual_cards', from: 'virtualCards' },
    { table: 'product_label_categories', from: 'labelCategories' },
    { table: 'product_labels', from: 'labels' },
    { table: 'product_labels_map', from: 'labelMap' },
    { table: 'product_param_templates', from: 'paramTemplates' },
    { table: 'product_params', from: 'params' },
    { table: 'product_protections', from: 'protections' },
    { table: 'product_protections_map', from: 'protectionMap' },
    { table: 'product_favorites', from: 'favorites' },
    { table: 'product_reviews', from: 'reviews' },
  ],
  softDependencies: [
    { group: 'user', into: 'keptUserIds', table: 'users' },
    { group: 'shipping', into: 'keptShippingTemplateIds', table: 'shipping_templates' },
  ],
  extras: (context) => ({
    migratedAt: context.migratedAt,
    // Orders are not migrated at all (PLAN §3), so these are empty by
    // definition rather than by accident: a sold card with no identifiable
    // order line is voided rather than handed out twice, and a review keeps
    // its text but loses its link. Both are counted in catalog's report.
    keptOrderIds: new Set<number>(),
    orderItemIds: new Map<string, number>(),
  }),
});

// ---------------------------------------------------------------------------
// 7. coupon — templates scope to products and categories, so it follows catalog.
// ---------------------------------------------------------------------------

const coupon = defineGroup({
  name: 'coupon',
  title: '优惠券与用户券包',
  owner: 'golden',
  mapper: mapCoupons,
  sources: [
    { table: 'eb_store_coupon_issue', into: 'issues' },
    { table: 'eb_store_coupon_product', into: 'couponProducts' },
    { table: 'eb_store_product_coupon', into: 'productCoupons' },
    { table: 'eb_store_coupon_user', into: 'couponUsers' },
  ],
  targets: [
    { table: 'coupon_templates', from: 'templates' },
    { table: 'coupon_template_products', from: 'templateProducts' },
    { table: 'coupon_template_categories', from: 'templateCategories' },
    { table: 'product_gift_coupons', from: 'productGiftCoupons' },
    { table: 'user_coupons', from: 'userCoupons' },
  ],
  softDependencies: [{ group: 'user', into: 'keptUserIds', table: 'users' }],
});

// ---------------------------------------------------------------------------
// 8. cms — not written yet.
// ---------------------------------------------------------------------------

const cms = defineGroup<
  { articles?: readonly unknown[] },
  { articles: TargetRow[]; report: object }
>({
  name: 'cms',
  title: '文章与文章分类',
  owner: 'F2',
  mapper: null,
  sources: [],
  targets: [],
});

// ---------------------------------------------------------------------------
// 9. diy — pages, themes and the link picker. No cross-group foreign keys.
// ---------------------------------------------------------------------------

const diy = defineGroup({
  name: 'diy',
  title: '页面装修',
  owner: 'G1',
  mapper: mapDiy,
  sources: [
    { table: 'eb_diy', into: 'diy' },
    { table: 'eb_theme', into: 'themes' },
    { table: 'eb_page_categroy', into: 'linkCategories' },
    { table: 'eb_page_link', into: 'links' },
  ],
  targets: [
    { table: 'diy_pages', from: 'pages' },
    { table: 'themes', from: 'themes' },
    { table: 'page_link_categories', from: 'linkCategories' },
    { table: 'page_links', from: 'links' },
  ],
});

// ---------------------------------------------------------------------------
// 10–11. WeChat OA and notifications — not written yet.
// ---------------------------------------------------------------------------

const wechatOa = defineGroup<
  { replies?: readonly unknown[] },
  { replies: TargetRow[]; report: object }
>({
  name: 'wechat-oa',
  title: '公众号自动回复、二维码、素材',
  owner: 'E2',
  mapper: null,
  sources: [],
  targets: [],
});

const notification = defineGroup<
  { templates?: readonly unknown[] },
  { templates: TargetRow[]; report: object }
>({
  name: 'notification',
  title: '通知模板与站内信',
  owner: 'E2',
  mapper: null,
  sources: [],
  targets: [],
});

/** Load order. Changing it changes the migration; it is a foreign-key order. */
export const GROUPS: readonly ErasedGroup[] = [
  system,
  config,
  storage,
  user,
  shipping,
  catalog,
  coupon,
  cms,
  diy,
  wechatOa,
  notification,
];

export function groupByName(name: string): ErasedGroup | undefined {
  return GROUPS.find((group) => group.name === name);
}

export function pendingGroups(): ErasedGroup[] {
  return GROUPS.filter((group) => group.pending);
}

/** The `url` a local attachment is served at, exported for `verify`. */
export { localPublicUrl };
export type { GroupContext };
