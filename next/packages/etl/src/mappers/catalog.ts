/**
 * Legacy product tables → the new catalog schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                             | New                                       |
 * | ---------------------------------- | ----------------------------------------- |
 * | `eb_store_category`                | `product_categories`                      |
 * | `eb_store_product`                 | `products`                                |
 * | `eb_store_product_cate`            | `product_categories_map`                  |
 * | `eb_store_product_description`     | `product_descriptions`                    |
 * | `eb_store_product.recommend_list`  | `product_recommendations`                 |
 * | `eb_store_product_attr`            | `product_specs` + `product_spec_values`   |
 * | `eb_store_product_attr_value`      | `product_skus`                            |
 * | `eb_store_product_virtual`         | `product_virtual_cards`                   |
 * | `eb_store_product_label_cate`      | `product_label_categories`                |
 * | `eb_store_product_label`           | `product_labels`                          |
 * | `eb_store_product.label_list`      | `product_labels_map`                      |
 * | `eb_store_product_param`           | `product_param_templates`                 |
 * | `eb_store_product.params_list`     | `product_params`                          |
 * | `eb_store_product_protection`      | `product_protections`                     |
 * | `eb_store_product.protection_list` | `product_protections_map`                 |
 * | `eb_store_product_relation`        | `product_favorites`                       |
 * | `eb_store_product_reply`           | `product_reviews`                         |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock, so the test beside it runs on literal rows
 * copied out of the legacy dump.
 *
 * Legacy tables deliberately NOT read:
 *
 *  - `eb_store_product_attr_result` — a cached JSON blob of the spec matrix the
 *    legacy admin rebuilt on every save. The matrix is derived from
 *    `eb_store_product_attr` + `_attr_value`, which are read here, so the cache
 *    would only be a second chance to be wrong;
 *  - `eb_store_product_coupon` — "buy this, get that coupon". Already mapped by
 *    `mappers/coupon.ts` into `product_gift_coupons`; mapping it twice would
 *    mean two sources for one table;
 *  - `eb_store_product_log` and `eb_store_visit` — behavioural counters, which
 *    belong to `stats` (`product_events`), not to this stream;
 *  - `eb_user_search` — search history, likewise `stats` (`search_logs`);
 *  - `eb_store_product_rule` — the 规格模板 an operator picks from when adding
 *    specs. The new editor has no such library (specs are typed per product),
 *    so there is nothing to migrate into;
 *  - `eb_store_product.label_id` — despite the name this holds *user* labels to
 *    stamp on whoever buys the product, a different feature owned by E1. The
 *    product's own labels are `label_list`.
 *
 * Legacy columns with no new home, counted in the report rather than silently
 * dropped: `custom_form` (a vue-form-create schema, no new renderer),
 * `eb_store_product_attr_value.disk_info` (per-SKU 手动发货 text) and
 * `.coupon_id` (per-SKU coupon for 优惠券商品; the new model attaches gift
 * coupons per product).
 *
 * Retired outright with their features, mapped nowhere and not counted:
 * `mer_id`, `vip_price` / `is_vip` / `vip_product`, `give_integral`,
 * `is_seckill` / `is_bargain` / `activity`, `brokerage` / `brokerage_two` /
 * `is_sub`, `presale*`, `soure_link`, `command_word`, `code_path`, `logistics`
 * (store pickup is gone), `is_gift` / `gift_price`.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_store_category`. */
export interface LegacyStoreCategory {
  id: number;
  pid: number;
  cate_name: string;
  /** Legacy sorts 分类 *descending* on this; the new tree sorts ascending. */
  sort: number;
  pic: string;
  big_pic?: string;
  /** 1 = shown. */
  is_show: number;
  add_time: number;
}

/** `eb_store_product`. Timestamps are unix seconds; `0` means "unset". */
export interface LegacyStoreProduct {
  id: number;
  store_name: string;
  store_info: string;
  keyword: string;
  bar_code: string;
  spu: string;
  /** Comma-separated category ids, duplicated into `eb_store_product_cate`. */
  cate_id: string;
  image: string;
  recommend_image: string;
  /** JSON array of URLs, as text. */
  slider_image: string;
  video_link: string;
  unit_name: string;
  price: string;
  ot_price: string;
  cost: string;
  postage: string;
  stock: number;
  sales: number;
  /** Padding added to the displayed sales figure. */
  ficti: number;
  browse: number;
  /** 1 = 上架. */
  is_show: number;
  is_hot: number;
  is_benefit: number;
  is_best: number;
  is_new: number;
  /** 优品推荐. */
  is_good: number;
  /** 1 = 多规格. */
  spec_type: number;
  /** 0 普通 / 1 卡密 / 2 优惠券 / 3 虚拟(手动发货). Indexes the legacy `$productType`. */
  virtual_type: number;
  /** 1 = the product is virtual at all. `virtual_type` is only meaningful with it. */
  is_virtual: number;
  /** 1 包邮 / 2 固定邮费(`postage`) / 3 运费模板(`temp_id`). */
  freight: number;
  /** Overrides `freight`: 1 = 包邮 whatever the mode said. */
  is_postage: number;
  temp_id: number;
  /** 1 = 限购开启. */
  is_limit: number;
  /** 1 单次限购 / 2 永久限购. */
  limit_type: number;
  limit_num: number;
  /** 起购数量. Legacy allows 0, which means 1. */
  min_qty: number;
  sort: number;
  /** 1 = soft-deleted (the legacy 回收站). */
  is_del: number;
  add_time: number;
  /** Comma-separated `product_labels` ids. */
  label_list: string;
  /** Comma-separated `product_protections` ids. */
  protection_list: string;
  /** Comma-separated product ids for "看了又看". */
  recommend_list: string;
  /** JSON `[{ "name": "…", "value": "…" }]`, as text. */
  params_list: string;
  /** JSON form schema, as text. No new renderer; counted and dropped. */
  custom_form: string;
}

/** `eb_store_product_cate`. */
export interface LegacyProductCate {
  product_id: number;
  cate_id: number;
}

/**
 * `eb_store_product_attr` — one spec axis.
 *
 * `type` is the *activity* the row belongs to (0 商品, 1 秒杀, 2 砍价, 3 拼团,
 * 4 预售) and for anything but 0 `product_id` points at the activity, not at a
 * product. Only `type = 0` is read.
 */
export interface LegacyProductAttr {
  id: number;
  product_id: number;
  attr_name: string;
  /** Comma-separated values, e.g. `冰冰蓝,小白裙`. */
  attr_values: string;
  type: number;
}

/** `eb_store_product_attr_value` — one buyable variant. Same `type` rule as above. */
export interface LegacyProductAttrValue {
  id: number;
  product_id: number;
  /** Comma-separated spec values in axis order, e.g. `冰冰蓝,8+128`. */
  suk: string;
  stock: number;
  sales: number;
  price: string;
  ot_price: string;
  cost: string;
  image: string;
  /** The variant key carried on cart rows, order items and card-key stock. */
  unique: string;
  bar_code: string;
  weight: string;
  volume: string;
  type: number;
  /** 1 = the shopper sees it. Absent in older dumps, where everything showed. */
  is_show?: number;
  /** 1 = preselected on the detail page. Absent in older dumps. */
  is_default_select?: number;
  /** 手动发货 text. No new column; counted and dropped. */
  disk_info?: string;
  /** Per-SKU coupon for 优惠券商品. No new column; counted and dropped. */
  coupon_id?: number;
}

/** `eb_store_product_description`. The body is `htmlspecialchars`-encoded. */
export interface LegacyProductDescription {
  product_id: number;
  description: string;
  type: number;
}

/** `eb_store_product_virtual` — card-key stock. */
export interface LegacyProductVirtual {
  id: number;
  product_id: number;
  /** `eb_store_product_attr_value.unique` of the variant this card belongs to. */
  attr_unique: string;
  card_no: string;
  card_pwd: string;
  card_unique: string;
  /** The legacy *order* id, as text, and empty while unsold. Never an order item. */
  order_id: string;
  uid: number;
}

/** `eb_store_product_label_cate`. */
export interface LegacyProductLabelCate {
  id: number;
  name: string;
  sort: number;
  add_time: number;
  is_del: number;
}

/** `eb_store_product_label`. */
export interface LegacyProductLabel {
  id: number;
  name: string;
  cate_id: number;
  /** 0 自定义样式 / 1 图片. */
  type: number;
  font_color: string;
  bg_color: string;
  border_color: string;
  image: string;
  /** 1 = rendered on the storefront. */
  is_show: number;
  /** 1 = enabled. */
  status: number;
  sort: number;
  add_time: number;
  is_del: number;
}

/** `eb_store_product_param` — the reusable 商品参数 library. */
export interface LegacyProductParam {
  id: number;
  name: string;
  /** Newline-separated suggested values. */
  value: string | null;
  sort: number;
  add_time: number;
  status: number;
  is_del: number;
}

/** `eb_store_product_protection` — the 商品保障 badges. */
export interface LegacyProductProtection {
  id: number;
  title: string;
  content: string;
  image: string;
  status: number;
  sort: number;
  add_time: number;
  is_del: number;
}

/** `eb_store_product_relation` — favourites and likes. Only `collect` is kept. */
export interface LegacyProductRelation {
  uid: number;
  product_id: number;
  /** `collect` or `like`. */
  type: string;
  /** `product`, `seckill`, … — which catalogue the id belongs to. */
  category: string;
  add_time: number;
}

/** `eb_store_product_reply`. */
export interface LegacyProductReply {
  id: number;
  uid: number;
  /** Legacy order id. */
  oid: number;
  /** The purchased variant's `eb_store_product_attr_value.unique`. */
  unique: string;
  product_id: number;
  /** `product`, `seckill`, … Only `product` survives. */
  reply_type: string;
  product_score: number;
  service_score: number;
  comment: string;
  /** JSON array of URLs, as text. */
  pics: string | null;
  add_time: number;
  merchant_reply_content: string;
  merchant_reply_time: number;
  is_del: number;
  is_reply: number;
  nickname: string;
  avatar: string;
  suk: string;
  /** 1 = 显示, 0 = 待审核. */
  status: number;
}

// ---------------------------------------------------------------------------
// output row shapes (a subset of the Drizzle insert types, by hand so that
// `@shop/etl` does not depend on `@shop/db` before the runner exists)
// ---------------------------------------------------------------------------

export type ProductKind = 'physical' | 'virtual_card' | 'virtual_coupon' | 'virtual_manual';
export type ProductStatus = 'draft' | 'on_shelf' | 'off_shelf';
export type ProductFreightMode = 'free' | 'fixed' | 'template';
export type ProductPurchaseLimitMode = 'none' | 'per_order' | 'lifetime';
export type ProductLabelStyle = 'text' | 'image';
export type ProductVirtualCardState = 'unclaimed' | 'claimed' | 'void';
export type ProductReviewStatus = 'pending' | 'published' | 'hidden';

export interface ProductCategoryRow {
  id: number;
  parentId: number | null;
  name: string;
  /** `/` for a root, `/3/17/` for a grandchild. */
  path: string;
  level: number;
  iconUrl: string | null;
  bannerUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductRow {
  id: number;
  name: string;
  subtitle: string | null;
  keyword: string | null;
  spu: string | null;
  barCode: string | null;
  kind: ProductKind;
  status: ProductStatus;
  imageUrl: string;
  cardImageUrl: string | null;
  sliderImages: string[];
  videoUrl: string | null;
  unitName: string | null;
  price: string;
  originalPrice: string | null;
  cost: string | null;
  stock: number;
  sales: number;
  displaySalesBoost: number;
  views: number;
  specMode: boolean;
  freightMode: ProductFreightMode;
  fixedFreight: string | null;
  shippingTemplateId: number | null;
  purchaseLimitMode: ProductPurchaseLimitMode;
  purchaseLimitQuantity: number | null;
  minPurchaseQuantity: number;
  isHot: boolean;
  isNew: boolean;
  isBest: boolean;
  isBenefit: boolean;
  isRecommended: boolean;
  customForm: null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductCategoryMapRow {
  productId: number;
  categoryId: number;
}

export interface ProductDescriptionRow {
  productId: number;
  contentHtml: string;
  updatedAt: Date;
}

export interface ProductRecommendationRow {
  productId: number;
  recommendedProductId: number;
  sortOrder: number;
}

export interface ProductSpecRow {
  id: number;
  productId: number;
  name: string;
  sortOrder: number;
}

export interface ProductSpecValueRow {
  id: number;
  specId: number;
  value: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface ProductSkuRow {
  id: number;
  productId: number;
  skuCode: string;
  specText: string;
  specValues: Record<string, string>;
  imageUrl: string | null;
  price: string;
  originalPrice: string | null;
  cost: string | null;
  stock: number;
  sales: number;
  barCode: string | null;
  weight: string | null;
  volume: string | null;
  isDefault: boolean;
  isVisible: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVirtualCardRow {
  id: number;
  productId: number;
  skuId: number;
  cardKey: string;
  cardNo: string;
  cardSecret: string | null;
  state: ProductVirtualCardState;
  orderItemId: number | null;
  claimedByUserId: number | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductLabelCategoryRow {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductLabelRow {
  id: number;
  categoryId: number | null;
  name: string;
  style: ProductLabelStyle;
  fontColor: string | null;
  backgroundColor: string | null;
  borderColor: string | null;
  imageUrl: string | null;
  isVisible: boolean;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductLabelMapRow {
  productId: number;
  labelId: number;
}

export interface ProductParamTemplateRow {
  id: number;
  name: string;
  suggestedValues: string | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductParamRow {
  id: number;
  productId: number;
  templateId: number | null;
  name: string;
  value: string;
  sortOrder: number;
}

export interface ProductProtectionRow {
  id: number;
  title: string;
  content: string | null;
  iconUrl: string | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ProductProtectionMapRow {
  productId: number;
  protectionId: number;
}

export interface ProductFavoriteRow {
  userId: number;
  productId: number;
  createdAt: Date;
}

export interface ProductReviewRow {
  id: number;
  productId: number;
  skuId: number | null;
  userId: number | null;
  orderId: number | null;
  orderItemId: number | null;
  authorNickname: string | null;
  authorAvatarUrl: string | null;
  specText: string | null;
  productScore: number;
  serviceScore: number;
  content: string | null;
  images: string[];
  status: ProductReviewStatus;
  replyContent: string | null;
  replyAt: Date | null;
  replyByAdminId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Why a row was not migrated, or was migrated with something missing. */
export interface CatalogMigrationReport {
  categories: number;
  categoriesReparentedToRoot: number;
  products: number;
  productsSoftDeleted: number;
  productsGivenSyntheticSku: number;
  productsWithoutImage: number;
  productsWithCustomFormDropped: number;
  productsDowngradedToFixedFreight: number;
  productsLimitDowngradedToNone: number;
  spuCollisionsCleared: number;
  categoryLinks: number;
  categoryLinksDroppedUnknownCategory: number;
  descriptions: number;
  recommendations: number;
  recommendationsDroppedUnknownProduct: number;
  specs: number;
  specValues: number;
  skus: number;
  skusDroppedDuplicateSpec: number;
  skuCodeCollisionsRenamed: number;
  skusWithDiskInfoDropped: number;
  skusWithCouponIdDropped: number;
  virtualCards: number;
  virtualCardsClaimed: number;
  virtualCardsVoidedWithoutOrderItem: number;
  virtualCardsDroppedUnknownSku: number;
  labelCategories: number;
  labels: number;
  labelLinks: number;
  labelLinksDroppedUnknownLabel: number;
  paramTemplates: number;
  params: number;
  protections: number;
  protectionLinks: number;
  protectionLinksDroppedUnknownProtection: number;
  favorites: number;
  favoritesDroppedNotCollect: number;
  favoritesDroppedUnknownUser: number;
  reviews: number;
  reviewsDroppedActivity: number;
  reviewsDroppedUnknownProduct: number;
  reviewsWithoutOrderItem: number;
  /** Names deduplicated to satisfy a new UNIQUE index: `{ table, name, keptId, droppedId }`. */
  nameCollisions: {
    table:
      | 'product_labels'
      | 'product_label_categories'
      | 'product_param_templates'
      | 'product_protections';
    name: string;
    keptId: number;
    droppedId: number;
  }[];
  /** Values cut to fit a narrower new column, so a human can review them. */
  truncatedFields: { table: string; id: number; column: string; length: number }[];
}

export interface CatalogMigrationInput {
  categories: readonly LegacyStoreCategory[];
  products: readonly LegacyStoreProduct[];
  productCategories?: readonly LegacyProductCate[];
  attrs?: readonly LegacyProductAttr[];
  attrValues?: readonly LegacyProductAttrValue[];
  descriptions?: readonly LegacyProductDescription[];
  virtuals?: readonly LegacyProductVirtual[];
  labelCategories?: readonly LegacyProductLabelCate[];
  labels?: readonly LegacyProductLabel[];
  paramTemplates?: readonly LegacyProductParam[];
  protections?: readonly LegacyProductProtection[];
  relations?: readonly LegacyProductRelation[];
  replies?: readonly LegacyProductReply[];
  /**
   * When the cutover happened. Legacy soft-deletes carry no timestamp, so this
   * is what lands in `deleted_at`: "deleted, as of the migration".
   */
  migratedAt: Date;
  /** Ids that survived the user migration. A favourite of a deleted account is dropped. */
  keptUserIds?: ReadonlySet<number>;
  /** Ids that survived the order migration. A review pointing elsewhere keeps its text, loses the link. */
  keptOrderIds?: ReadonlySet<number>;
  /** Ids that survived the shipping migration. A product pointing elsewhere falls back to 固定邮费. */
  keptShippingTemplateIds?: ReadonlySet<number>;
  /**
   * `${legacyOrderId}:${attrUnique}` → new `order_items.id`, from the order
   * migration. The legacy card and review rows only name the *order*, so
   * without this map a sold card cannot be re-attached to its line: it is
   * voided rather than handed out twice, and a review keeps its text but loses
   * its line.
   */
  orderItemIds?: ReadonlyMap<string, number>;
}

export interface CatalogMigrationOutput {
  categories: ProductCategoryRow[];
  products: ProductRow[];
  productCategories: ProductCategoryMapRow[];
  descriptions: ProductDescriptionRow[];
  recommendations: ProductRecommendationRow[];
  specs: ProductSpecRow[];
  specValues: ProductSpecValueRow[];
  skus: ProductSkuRow[];
  virtualCards: ProductVirtualCardRow[];
  labelCategories: ProductLabelCategoryRow[];
  labels: ProductLabelRow[];
  labelMap: ProductLabelMapRow[];
  paramTemplates: ProductParamTemplateRow[];
  params: ProductParamRow[];
  protections: ProductProtectionRow[];
  protectionMap: ProductProtectionMapRow[];
  favorites: ProductFavoriteRow[];
  reviews: ProductReviewRow[];
  report: CatalogMigrationReport;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Legacy comma-separated id list; tolerates blanks, spaces and non-numbers. */
function idList(value: string | null | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Legacy JSON text column. Anything unparseable is an empty list, never a throw. */
function jsonStrings(value: string | null | undefined): string[] {
  const raw = (value ?? '').trim();
  if (raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item !== '');
  } catch {
    return [];
  }
}

/**
 * The legacy description column holds `htmlspecialchars`-encoded HTML and the
 * legacy model decodes it on read (`StoreDescription::getDescriptionAttr`).
 * The new column holds the HTML itself, so a migration that skips this step
 * renders every product detail page as visible tag soup.
 */
export function decodeLegacyHtml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&');
}

/** Legacy `sort` counts down (99 first); the new tree, labels and params count up. */
function invertedSort(sort: number): number {
  return -sort;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

export function mapCatalog(input: CatalogMigrationInput): CatalogMigrationOutput {
  const report = emptyReport();
  const { migratedAt } = input;

  const truncate = (table: string, id: number, column: string, value: string, max: number) => {
    if (value.length <= max) return value;
    report.truncatedFields.push({ table, id, column, length: value.length });
    return value.slice(0, max);
  };

  // -- categories -----------------------------------------------------------
  const legacyCategories = [...input.categories].sort((a, b) => a.id - b.id);
  const categoryById = new Map(legacyCategories.map((row) => [row.id, row]));
  const categories: ProductCategoryRow[] = [];

  for (const row of legacyCategories) {
    const ancestors = ancestorsOf(row, categoryById);
    if (ancestors === null) {
      // A parent that is gone, or a cycle. Root is the only honest answer: the
      // alternative is a row the FK would refuse.
      report.categoriesReparentedToRoot += 1;
    }
    const chain = ancestors ?? [];
    const createdAt = instant(row.add_time) ?? migratedAt;
    categories.push({
      id: row.id,
      parentId: ancestors === null ? null : row.pid > 0 ? row.pid : null,
      path: chain.length === 0 ? '/' : `/${chain.join('/')}/`,
      level: chain.length,
      name: truncate('product_categories', row.id, 'name', row.cate_name, 100),
      iconUrl: blankToNull(row.pic),
      bannerUrl: blankToNull(row.big_pic),
      sortOrder: invertedSort(row.sort),
      isVisible: row.is_show === 1,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
  }
  const keptCategoryIds = new Set(categories.map((row) => row.id));
  report.categories = categories.length;

  // -- taxonomy (label categories, labels, param templates, protections) ----
  // Each of these gained a UNIQUE index on its name, which legacy did not have,
  // so duplicates collapse onto the lowest id and everything pointing at the
  // loser is repointed at the winner.
  const labelCategories: ProductLabelCategoryRow[] = [];
  const labelCategoryIdMap = new Map<number, number>();
  const labelCategoryByName = new Map<string, number>();
  for (const row of [...(input.labelCategories ?? [])].sort((a, b) => a.id - b.id)) {
    const name = truncate('product_label_categories', row.id, 'name', row.name.trim(), 64);
    const existing = labelCategoryByName.get(name);
    if (existing !== undefined) {
      report.nameCollisions.push({
        table: 'product_label_categories',
        name,
        keptId: existing,
        droppedId: row.id,
      });
      labelCategoryIdMap.set(row.id, existing);
      continue;
    }
    const createdAt = instant(row.add_time) ?? migratedAt;
    labelCategories.push({
      id: row.id,
      name,
      sortOrder: invertedSort(row.sort),
      createdAt,
      updatedAt: createdAt,
      deletedAt: row.is_del === 1 ? migratedAt : null,
    });
    labelCategoryByName.set(name, row.id);
    labelCategoryIdMap.set(row.id, row.id);
  }
  report.labelCategories = labelCategories.length;

  const labels: ProductLabelRow[] = [];
  const labelIdMap = new Map<number, number>();
  const labelByName = new Map<string, number>();
  for (const row of [...(input.labels ?? [])].sort((a, b) => a.id - b.id)) {
    const name = truncate('product_labels', row.id, 'name', row.name.trim(), 64);
    const existing = labelByName.get(name);
    if (existing !== undefined) {
      report.nameCollisions.push({
        table: 'product_labels',
        name,
        keptId: existing,
        droppedId: row.id,
      });
      labelIdMap.set(row.id, existing);
      continue;
    }
    const createdAt = instant(row.add_time) ?? migratedAt;
    labels.push({
      id: row.id,
      categoryId: labelCategoryIdMap.get(row.cate_id) ?? null,
      name,
      style: row.type === 1 ? 'image' : 'text',
      fontColor: blankToNull(row.font_color),
      backgroundColor: blankToNull(row.bg_color),
      borderColor: blankToNull(row.border_color),
      imageUrl: blankToNull(row.image),
      isVisible: row.is_show === 1,
      isEnabled: row.status === 1,
      sortOrder: invertedSort(row.sort),
      createdAt,
      updatedAt: createdAt,
      deletedAt: row.is_del === 1 ? migratedAt : null,
    });
    labelByName.set(name, row.id);
    labelIdMap.set(row.id, row.id);
  }
  report.labels = labels.length;

  const paramTemplates: ProductParamTemplateRow[] = [];
  const paramTemplateIdMap = new Map<number, number>();
  const paramTemplateByName = new Map<string, number>();
  for (const row of [...(input.paramTemplates ?? [])].sort((a, b) => a.id - b.id)) {
    const name = truncate('product_param_templates', row.id, 'name', row.name.trim(), 64);
    const existing = paramTemplateByName.get(name);
    if (existing !== undefined) {
      report.nameCollisions.push({
        table: 'product_param_templates',
        name,
        keptId: existing,
        droppedId: row.id,
      });
      paramTemplateIdMap.set(row.id, existing);
      continue;
    }
    const createdAt = instant(row.add_time) ?? migratedAt;
    paramTemplates.push({
      id: row.id,
      name,
      suggestedValues: blankToNull(row.value),
      isEnabled: row.status === 1,
      sortOrder: invertedSort(row.sort),
      createdAt,
      updatedAt: createdAt,
      deletedAt: row.is_del === 1 ? migratedAt : null,
    });
    paramTemplateByName.set(name, row.id);
    paramTemplateIdMap.set(row.id, row.id);
  }
  report.paramTemplates = paramTemplates.length;
  const templateIdByName = new Map(paramTemplates.map((row) => [row.name, row.id]));

  const protections: ProductProtectionRow[] = [];
  const protectionIdMap = new Map<number, number>();
  const protectionByTitle = new Map<string, number>();
  for (const row of [...(input.protections ?? [])].sort((a, b) => a.id - b.id)) {
    const title = truncate('product_protections', row.id, 'title', row.title.trim(), 64);
    const existing = protectionByTitle.get(title);
    if (existing !== undefined) {
      report.nameCollisions.push({
        table: 'product_protections',
        name: title,
        keptId: existing,
        droppedId: row.id,
      });
      protectionIdMap.set(row.id, existing);
      continue;
    }
    const createdAt = instant(row.add_time) ?? migratedAt;
    protections.push({
      id: row.id,
      title,
      content: blankToNull(row.content),
      iconUrl: blankToNull(row.image),
      isEnabled: row.status === 1,
      sortOrder: invertedSort(row.sort),
      createdAt,
      updatedAt: createdAt,
      deletedAt: row.is_del === 1 ? migratedAt : null,
    });
    protectionByTitle.set(title, row.id);
    protectionIdMap.set(row.id, row.id);
  }
  report.protections = protections.length;

  // -- specs ----------------------------------------------------------------
  // Only `type = 0`: for every other value `product_id` is an *activity* id,
  // and all of those activities are retired.
  const specs: ProductSpecRow[] = [];
  const specValues: ProductSpecValueRow[] = [];
  const specIdsByProduct = new Map<number, ProductSpecRow[]>();
  let nextSpecValueId = 1;

  for (const row of [...(input.attrs ?? [])]
    .filter((a) => a.type === 0)
    .sort((a, b) => a.id - b.id)) {
    const list = specIdsByProduct.get(row.product_id) ?? [];
    const name = truncate('product_specs', row.id, 'name', row.attr_name.trim(), 64);
    // `product_specs_name_uq` is new. A product with the axis twice keeps the
    // first, and the second's values fold into it.
    const already = list.find((spec) => spec.name === name);
    const spec = already ?? {
      id: row.id,
      productId: row.product_id,
      name,
      sortOrder: list.length,
    };
    if (already === undefined) {
      specs.push(spec);
      list.push(spec);
      specIdsByProduct.set(row.product_id, list);
    }

    const seen = new Set(specValues.filter((v) => v.specId === spec.id).map((v) => v.value));
    for (const raw of row.attr_values.split(',')) {
      const value = truncate('product_spec_values', row.id, 'value', raw.trim(), 64);
      if (value === '' || seen.has(value)) continue;
      seen.add(value);
      specValues.push({
        id: nextSpecValueId++,
        specId: spec.id,
        value,
        imageUrl: null,
        sortOrder: seen.size - 1,
      });
    }
  }
  report.specs = specs.length;
  report.specValues = specValues.length;

  // -- SKUs -----------------------------------------------------------------
  const skus: ProductSkuRow[] = [];
  const skusByProduct = new Map<number, ProductSkuRow[]>();
  const skuIdByLegacyUnique = new Map<string, number>();
  const usedSkuCodes = new Set<string>();

  for (const row of [...(input.attrValues ?? [])]
    .filter((a) => a.type === 0)
    .sort((a, b) => a.id - b.id)) {
    const specText = truncate('product_skus', row.id, 'specText', row.suk.trim(), 255);
    const siblings = skusByProduct.get(row.product_id) ?? [];
    // `product_skus_spec_uq` is new; legacy indexed (product_id, suk) without
    // UNIQUE and did produce duplicates.
    if (siblings.some((sku) => sku.specText === specText)) {
      report.skusDroppedDuplicateSpec += 1;
      continue;
    }

    let skuCode = row.unique.trim() === '' ? `sku-${row.id}` : row.unique.trim();
    if (usedSkuCodes.has(skuCode)) {
      skuCode = `${skuCode}-${row.id}`;
      report.skuCodeCollisionsRenamed += 1;
    }
    usedSkuCodes.add(skuCode);

    if (blankToNull(row.disk_info) !== null) report.skusWithDiskInfoDropped += 1;
    if ((row.coupon_id ?? 0) > 0) report.skusWithCouponIdDropped += 1;

    const createdAt = migratedAt;
    const sku: ProductSkuRow = {
      id: row.id,
      productId: row.product_id,
      skuCode,
      specText,
      specValues: specValuesOf(specText, specIdsByProduct.get(row.product_id) ?? []),
      imageUrl: blankToNull(row.image),
      price: row.price,
      originalPrice: blankToNull(row.ot_price),
      cost: blankToNull(row.cost),
      stock: Math.max(0, row.stock),
      sales: Math.max(0, row.sales),
      barCode: blankToNull(row.bar_code),
      weight: blankToNull(row.weight),
      volume: blankToNull(row.volume),
      // Fixed up once the whole product is known: exactly one default per
      // product, or `product_skus_default_uq` refuses the batch.
      isDefault: (row.is_default_select ?? 0) === 1,
      isVisible: (row.is_show ?? 1) === 1,
      sortOrder: siblings.length,
      createdAt,
      updatedAt: createdAt,
    };
    skus.push(sku);
    siblings.push(sku);
    skusByProduct.set(row.product_id, siblings);
    if (row.unique.trim() !== '') skuIdByLegacyUnique.set(row.unique.trim(), sku.id);
  }

  // -- products -------------------------------------------------------------
  const descriptionByProduct = new Map(
    (input.descriptions ?? []).filter((d) => d.type === 0).map((d) => [d.product_id, d]),
  );
  const products: ProductRow[] = [];
  const productCategoryLinks: ProductCategoryMapRow[] = [];
  const descriptions: ProductDescriptionRow[] = [];
  const labelMap: ProductLabelMapRow[] = [];
  const protectionMap: ProductProtectionMapRow[] = [];
  const params: ProductParamRow[] = [];
  const usedSpus = new Set<string>();
  const recommendationDrafts: { productId: number; ids: number[] }[] = [];
  let nextParamId = 1;
  let nextSyntheticSkuId = highestId(skus) + 1;

  const legacyProducts = [...input.products].sort((a, b) => a.id - b.id);
  const extraCategoryLinks = new Map<number, Set<number>>();
  for (const link of input.productCategories ?? []) {
    const set = extraCategoryLinks.get(link.product_id) ?? new Set<number>();
    set.add(link.cate_id);
    extraCategoryLinks.set(link.product_id, set);
  }

  for (const row of legacyProducts) {
    let productSkus = skusByProduct.get(row.id) ?? [];
    if (productSkus.length === 0) {
      // Legacy always wrote one attr_value row even for a single-spec product,
      // so this is broken data rather than a shape. A product with no SKU is
      // unbuyable in the new model, so it gets one built from its own columns.
      const synthetic: ProductSkuRow = {
        id: nextSyntheticSkuId++,
        productId: row.id,
        skuCode: `sku-p${row.id}`,
        specText: '',
        specValues: {},
        imageUrl: blankToNull(row.image),
        price: row.price,
        originalPrice: blankToNull(row.ot_price),
        cost: blankToNull(row.cost),
        stock: Math.max(0, row.stock),
        sales: Math.max(0, row.sales),
        barCode: blankToNull(row.bar_code),
        weight: null,
        volume: null,
        isDefault: true,
        isVisible: true,
        sortOrder: 0,
        createdAt: migratedAt,
        updatedAt: migratedAt,
      };
      skus.push(synthetic);
      productSkus = [synthetic];
      skusByProduct.set(row.id, productSkus);
      report.productsGivenSyntheticSku += 1;
    }

    // Exactly one default, and it must be a visible one or the detail page
    // opens on a variant nobody can buy.
    const preferred =
      productSkus.find((sku) => sku.isDefault && sku.isVisible) ??
      productSkus.find((sku) => sku.isVisible) ??
      productSkus[0]!;
    for (const sku of productSkus) sku.isDefault = sku === preferred;

    const live = productSkus.filter((sku) => sku.isVisible);
    const priced = (live.length > 0 ? live : productSkus).slice().sort(byMoney);

    let spu = blankToNull(row.spu);
    if (spu !== null && usedSpus.has(spu)) {
      // `products_spu_uq` is new; the legacy column was free text.
      report.spuCollisionsCleared += 1;
      spu = null;
    }
    if (spu !== null) usedSpus.add(spu);

    if (blankToNull(row.image) === null) report.productsWithoutImage += 1;
    if (jsonForm(row.custom_form)) report.productsWithCustomFormDropped += 1;

    const freight = freightOf(row, input.keptShippingTemplateIds);
    if (freight.downgraded) report.productsDowngradedToFixedFreight += 1;
    const limit = limitOf(row);
    if (limit.downgraded) report.productsLimitDowngradedToNone += 1;

    const createdAt = instant(row.add_time) ?? migratedAt;
    const deletedAt = row.is_del === 1 ? migratedAt : null;
    if (deletedAt !== null) report.productsSoftDeleted += 1;

    products.push({
      id: row.id,
      name: truncate('products', row.id, 'name', row.store_name, 128),
      subtitle: blankToNull(truncate('products', row.id, 'subtitle', row.store_info, 255)),
      keyword: blankToNull(truncate('products', row.id, 'keyword', row.keyword, 255)),
      spu,
      barCode: blankToNull(row.bar_code),
      kind: kindOf(row),
      // A legacy soft-delete is not a shelf state: the product keeps whatever
      // `is_show` said and `deleted_at` is what hides it.
      status: row.is_show === 1 ? 'on_shelf' : 'off_shelf',
      imageUrl: row.image,
      cardImageUrl: blankToNull(row.recommend_image),
      sliderImages: jsonStrings(row.slider_image),
      videoUrl: blankToNull(row.video_link),
      unitName: blankToNull(row.unit_name),
      price: priced[0]?.price ?? row.price,
      originalPrice: blankToNull(row.ot_price),
      cost: priced[0]?.cost ?? blankToNull(row.cost),
      stock: live.reduce((sum, sku) => sum + sku.stock, 0),
      // The legacy product row carries the authoritative displayed figure; the
      // per-SKU counters lag behind it in every dump we have seen.
      sales: Math.max(0, row.sales),
      displaySalesBoost: Math.max(0, row.ficti),
      views: Math.max(0, row.browse),
      specMode: row.spec_type === 1,
      freightMode: freight.mode,
      fixedFreight: freight.fixed,
      shippingTemplateId: freight.templateId,
      purchaseLimitMode: limit.mode,
      purchaseLimitQuantity: limit.quantity,
      minPurchaseQuantity: Math.max(1, row.min_qty),
      isHot: row.is_hot === 1,
      isNew: row.is_new === 1,
      isBest: row.is_best === 1,
      isBenefit: row.is_benefit === 1,
      isRecommended: row.is_good === 1,
      customForm: null,
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt,
    });

    // Categories: the comma list on the product and the helper table say the
    // same thing in the dumps we have, so they are unioned rather than trusted
    // one over the other.
    const linked = new Set<number>([
      ...idList(row.cate_id),
      ...(extraCategoryLinks.get(row.id) ?? []),
    ]);
    for (const categoryId of [...linked].sort((a, b) => a - b)) {
      if (!keptCategoryIds.has(categoryId)) {
        report.categoryLinksDroppedUnknownCategory += 1;
        continue;
      }
      productCategoryLinks.push({ productId: row.id, categoryId });
    }

    const description = descriptionByProduct.get(row.id);
    if (description && (description.description ?? '').trim() !== '') {
      descriptions.push({
        productId: row.id,
        contentHtml: decodeLegacyHtml(description.description),
        updatedAt: createdAt,
      });
    }

    for (const labelId of new Set(idList(row.label_list))) {
      const mapped = labelIdMap.get(labelId);
      if (mapped === undefined) {
        report.labelLinksDroppedUnknownLabel += 1;
        continue;
      }
      if (!labelMap.some((m) => m.productId === row.id && m.labelId === mapped)) {
        labelMap.push({ productId: row.id, labelId: mapped });
      }
    }

    for (const protectionId of new Set(idList(row.protection_list))) {
      const mapped = protectionIdMap.get(protectionId);
      if (mapped === undefined) {
        report.protectionLinksDroppedUnknownProtection += 1;
        continue;
      }
      if (!protectionMap.some((m) => m.productId === row.id && m.protectionId === mapped)) {
        protectionMap.push({ productId: row.id, protectionId: mapped });
      }
    }

    const seenParams = new Set<string>();
    for (const [index, entry] of paramList(row.params_list).entries()) {
      const name = truncate('product_params', row.id, 'name', entry.name.trim(), 64);
      const value = truncate('product_params', row.id, 'value', entry.value.trim(), 255);
      // `product_params_name_uq` is new.
      if (name === '' || seenParams.has(name)) continue;
      seenParams.add(name);
      params.push({
        id: nextParamId++,
        productId: row.id,
        // Legacy stored the参数 as free text with no link back to the library;
        // a name that still matches a template is relinked, the rest stay loose.
        templateId: templateIdByName.get(name) ?? null,
        name,
        value,
        sortOrder: index,
      });
    }

    const recommended = idList(row.recommend_list).filter((id) => id !== row.id);
    if (recommended.length > 0) recommendationDrafts.push({ productId: row.id, ids: recommended });
  }

  const keptProductIds = new Set(products.map((row) => row.id));
  report.products = products.length;
  report.categoryLinks = productCategoryLinks.length;
  report.descriptions = descriptions.length;
  report.labelLinks = labelMap.length;
  report.protectionLinks = protectionMap.length;
  report.params = params.length;
  report.skus = skus.length;

  // SKUs whose product never made it would violate the FK.
  const orphanSkus = skus.filter((sku) => !keptProductIds.has(sku.productId));
  for (const orphan of orphanSkus) skus.splice(skus.indexOf(orphan), 1);
  report.skus = skus.length;
  const keptSkuIds = new Set(skus.map((sku) => sku.id));

  const recommendations: ProductRecommendationRow[] = [];
  for (const draft of recommendationDrafts) {
    let sortOrder = 0;
    for (const id of new Set(draft.ids)) {
      if (!keptProductIds.has(id)) {
        report.recommendationsDroppedUnknownProduct += 1;
        continue;
      }
      recommendations.push({
        productId: draft.productId,
        recommendedProductId: id,
        sortOrder: sortOrder++,
      });
    }
  }
  report.recommendations = recommendations.length;

  // -- card-key stock -------------------------------------------------------
  const virtualCards: ProductVirtualCardRow[] = [];
  const claimedOrderItems = new Set<number>();
  for (const row of [...(input.virtuals ?? [])].sort((a, b) => a.id - b.id)) {
    const skuId = skuIdByLegacyUnique.get(row.attr_unique.trim());
    if (skuId === undefined || !keptSkuIds.has(skuId)) {
      report.virtualCardsDroppedUnknownSku += 1;
      continue;
    }
    const legacyOrderId = row.order_id.trim();
    const sold = legacyOrderId !== '';
    const orderItemId = sold
      ? (input.orderItemIds?.get(`${legacyOrderId}:${row.attr_unique.trim()}`) ?? null)
      : null;
    // `product_virtual_cards_claim_consistent` ties `state = 'claimed'` to an
    // order item. A card that was sold but whose line cannot be identified is
    // voided, never returned to the pool: handing it to a second buyer is the
    // one outcome that costs real money.
    let state: ProductVirtualCardState = 'unclaimed';
    if (sold) {
      if (orderItemId !== null && !claimedOrderItems.has(orderItemId)) {
        state = 'claimed';
        claimedOrderItems.add(orderItemId);
        report.virtualCardsClaimed += 1;
      } else {
        state = 'void';
        report.virtualCardsVoidedWithoutOrderItem += 1;
      }
    }

    virtualCards.push({
      id: row.id,
      productId: skus.find((sku) => sku.id === skuId)!.productId,
      skuId,
      cardKey: row.card_unique.trim() === '' ? `card-${row.id}` : row.card_unique.trim(),
      cardNo: row.card_no,
      cardSecret: blankToNull(row.card_pwd),
      state,
      orderItemId: state === 'claimed' ? orderItemId : null,
      claimedByUserId: state === 'claimed' && row.uid > 0 ? row.uid : null,
      // Legacy never recorded when a card was handed over.
      claimedAt: state === 'claimed' ? migratedAt : null,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    });
  }
  report.virtualCards = virtualCards.length;

  // -- favourites -----------------------------------------------------------
  const favorites: ProductFavoriteRow[] = [];
  const seenFavorites = new Set<string>();
  for (const row of input.relations ?? []) {
    // 点赞 is gone, and `category` names the catalogue: a favourited seckill id
    // is an *activity* id, not a product id.
    if (row.type !== 'collect' || (row.category !== '' && row.category !== 'product')) {
      report.favoritesDroppedNotCollect += 1;
      continue;
    }
    if (!keptProductIds.has(row.product_id)) continue;
    if (input.keptUserIds && !input.keptUserIds.has(row.uid)) {
      report.favoritesDroppedUnknownUser += 1;
      continue;
    }
    const key = `${row.uid}:${row.product_id}`;
    if (seenFavorites.has(key)) continue;
    seenFavorites.add(key);
    favorites.push({
      userId: row.uid,
      productId: row.product_id,
      createdAt: instant(row.add_time) ?? migratedAt,
    });
  }
  report.favorites = favorites.length;

  // -- reviews --------------------------------------------------------------
  const reviews: ProductReviewRow[] = [];
  const usedOrderItems = new Set<number>();
  for (const row of [...(input.replies ?? [])].sort((a, b) => a.id - b.id)) {
    if (row.reply_type !== '' && row.reply_type !== 'product') {
      report.reviewsDroppedActivity += 1;
      continue;
    }
    if (!keptProductIds.has(row.product_id)) {
      report.reviewsDroppedUnknownProduct += 1;
      continue;
    }

    const key = `${row.oid}:${row.unique.trim()}`;
    let orderItemId = row.oid > 0 ? (input.orderItemIds?.get(key) ?? null) : null;
    // `product_reviews_order_item_uq` allows at most one review per line.
    if (orderItemId !== null && usedOrderItems.has(orderItemId)) orderItemId = null;
    if (orderItemId !== null) usedOrderItems.add(orderItemId);
    if (orderItemId === null && row.oid > 0) report.reviewsWithoutOrderItem += 1;

    const createdAt = instant(row.add_time) ?? migratedAt;
    const repliedAt = instant(row.merchant_reply_time);
    const replyContent = blankToNull(row.merchant_reply_content);
    const skuId = skuIdByLegacyUnique.get(row.unique.trim());

    reviews.push({
      id: row.id,
      productId: row.product_id,
      skuId: skuId !== undefined && keptSkuIds.has(skuId) ? skuId : null,
      userId:
        row.uid > 0 && (input.keptUserIds === undefined || input.keptUserIds.has(row.uid))
          ? row.uid
          : null,
      orderId:
        row.oid > 0 && (input.keptOrderIds === undefined || input.keptOrderIds.has(row.oid))
          ? row.oid
          : null,
      orderItemId,
      authorNickname: blankToNull(row.nickname),
      authorAvatarUrl: blankToNull(row.avatar),
      specText: blankToNull(row.suk),
      // `product_reviews_scores_range` is 1..5; legacy allowed 0, which means
      // "not scored" and reads as the neutral 5 the legacy storefront rendered.
      productScore: clampScore(row.product_score),
      serviceScore: clampScore(row.service_score),
      content: blankToNull(row.comment),
      images: jsonStrings(row.pics),
      status: row.status === 1 ? 'published' : 'pending',
      replyContent,
      replyAt: replyContent === null ? null : (repliedAt ?? createdAt),
      // Legacy recorded no operator behind a reply.
      replyByAdminId: null,
      createdAt,
      updatedAt: repliedAt ?? createdAt,
      deletedAt: row.is_del === 1 ? migratedAt : null,
    });
  }
  report.reviews = reviews.length;

  return {
    categories,
    products,
    productCategories: productCategoryLinks,
    descriptions,
    recommendations,
    specs,
    specValues,
    skus,
    virtualCards,
    labelCategories,
    labels,
    labelMap,
    paramTemplates,
    params,
    protections,
    protectionMap,
    favorites,
    reviews,
    report,
  };
}

// ---------------------------------------------------------------------------
// per-column rules
// ---------------------------------------------------------------------------

/**
 * `is_virtual` + `virtual_type` → `products.kind`.
 *
 * Legacy indexed `['普通商品', '卡密商品', '优惠券商品', '虚拟商品']` by
 * `virtual_type`, and only when `is_virtual` was set — the "fix, don't port"
 * item in the brief. A `virtual_type` outside 0..3 is a physical product.
 */
function kindOf(row: LegacyStoreProduct): ProductKind {
  if (row.is_virtual !== 1) return 'physical';
  if (row.virtual_type === 1) return 'virtual_card';
  if (row.virtual_type === 2) return 'virtual_coupon';
  if (row.virtual_type === 3) return 'virtual_manual';
  return 'physical';
}

/**
 * `freight` 1/2/3 plus the `is_postage` override.
 *
 * `products_freight_source` demands a template id for `template` and an amount
 * for `fixed`, so a product pointing at a template that did not survive falls
 * back to its own `postage` rather than becoming a row the CHECK refuses.
 */
function freightOf(
  row: LegacyStoreProduct,
  keptTemplates: ReadonlySet<number> | undefined,
): {
  mode: ProductFreightMode;
  fixed: string | null;
  templateId: number | null;
  downgraded: boolean;
} {
  if (row.is_postage === 1 || row.freight === 1) {
    return { mode: 'free', fixed: null, templateId: null, downgraded: false };
  }
  if (row.freight === 3) {
    const usable =
      row.temp_id > 0 && (keptTemplates === undefined || keptTemplates.has(row.temp_id));
    if (usable) {
      return { mode: 'template', fixed: null, templateId: row.temp_id, downgraded: false };
    }
    return { mode: 'fixed', fixed: row.postage, templateId: null, downgraded: true };
  }
  return { mode: 'fixed', fixed: row.postage, templateId: null, downgraded: false };
}

/**
 * `is_limit` + `limit_type` + `limit_num` → the purchase-limit pair.
 *
 * `products_limit_quantity` demands a quantity of at least 1 whenever the mode
 * is not `none`, and legacy happily stored `is_limit = 1` with `limit_num = 0`,
 * which meant "no limit" in practice.
 */
function limitOf(row: LegacyStoreProduct): {
  mode: ProductPurchaseLimitMode;
  quantity: number | null;
  downgraded: boolean;
} {
  if (row.is_limit !== 1) return { mode: 'none', quantity: null, downgraded: false };
  if (row.limit_num < 1) return { mode: 'none', quantity: null, downgraded: true };
  return {
    mode: row.limit_type === 1 ? 'per_order' : 'lifetime',
    quantity: row.limit_num,
    downgraded: false,
  };
}

/** `{ "颜色": "冰冰蓝", "机型": "8+128" }` from `冰冰蓝,8+128` and the product's axes. */
function specValuesOf(specText: string, specs: readonly ProductSpecRow[]): Record<string, string> {
  if (specText === '' || specs.length === 0) return {};
  const parts = specText.split(',');
  const out: Record<string, string> = {};
  for (const [index, spec] of specs.entries()) {
    const value = parts[index];
    if (value === undefined) break;
    out[spec.name] = value.trim();
  }
  return out;
}

/** Legacy `params_list`: `[{ name, value }]` as text, per 商品参数 in the legacy editor. */
function paramList(value: string): { name: string; value: string }[] {
  const raw = (value ?? '').trim();
  if (raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const entry = item as { name?: unknown; value?: unknown };
      if (typeof entry.name !== 'string') return [];
      return [{ name: entry.name, value: typeof entry.value === 'string' ? entry.value : '' }];
    });
  } catch {
    return [];
  }
}

/** Whether `custom_form` holds anything at all, so the drop can be counted. */
function jsonForm(value: string): boolean {
  const raw = (value ?? '').trim();
  if (raw === '' || raw === '[]' || raw === '{}') return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length > 0 : parsed !== null;
  } catch {
    return false;
  }
}

/** Legacy allowed 0 ("not scored"); the new CHECK is 1..5. */
function clampScore(score: number): number {
  if (!Number.isFinite(score) || score < 1) return 5;
  return Math.min(5, Math.trunc(score));
}

function byMoney(a: ProductSkuRow, b: ProductSkuRow): number {
  return Number(a.price) - Number(b.price);
}

function highestId(rows: readonly { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0);
}

/**
 * The ancestor id chain of a category, root first, or `null` when the chain is
 * broken — a missing parent or a cycle, both of which exist in real dumps.
 */
function ancestorsOf(
  row: LegacyStoreCategory,
  byId: ReadonlyMap<number, LegacyStoreCategory>,
): number[] | null {
  const chain: number[] = [];
  const seen = new Set<number>([row.id]);
  let parentId = row.pid;
  while (parentId > 0) {
    if (seen.has(parentId)) return null;
    const parent = byId.get(parentId);
    if (parent === undefined) return null;
    seen.add(parentId);
    chain.unshift(parentId);
    parentId = parent.pid;
  }
  return chain;
}

function emptyReport(): CatalogMigrationReport {
  return {
    categories: 0,
    categoriesReparentedToRoot: 0,
    products: 0,
    productsSoftDeleted: 0,
    productsGivenSyntheticSku: 0,
    productsWithoutImage: 0,
    productsWithCustomFormDropped: 0,
    productsDowngradedToFixedFreight: 0,
    productsLimitDowngradedToNone: 0,
    spuCollisionsCleared: 0,
    categoryLinks: 0,
    categoryLinksDroppedUnknownCategory: 0,
    descriptions: 0,
    recommendations: 0,
    recommendationsDroppedUnknownProduct: 0,
    specs: 0,
    specValues: 0,
    skus: 0,
    skusDroppedDuplicateSpec: 0,
    skuCodeCollisionsRenamed: 0,
    skusWithDiskInfoDropped: 0,
    skusWithCouponIdDropped: 0,
    virtualCards: 0,
    virtualCardsClaimed: 0,
    virtualCardsVoidedWithoutOrderItem: 0,
    virtualCardsDroppedUnknownSku: 0,
    labelCategories: 0,
    labels: 0,
    labelLinks: 0,
    labelLinksDroppedUnknownLabel: 0,
    paramTemplates: 0,
    params: 0,
    protections: 0,
    protectionLinks: 0,
    protectionLinksDroppedUnknownProtection: 0,
    favorites: 0,
    favoritesDroppedNotCollect: 0,
    favoritesDroppedUnknownUser: 0,
    reviews: 0,
    reviewsDroppedActivity: 0,
    reviewsDroppedUnknownProduct: 0,
    reviewsWithoutOrderItem: 0,
    nameCollisions: [],
    truncatedFields: [],
  };
}
