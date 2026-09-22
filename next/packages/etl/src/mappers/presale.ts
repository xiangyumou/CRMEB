/**
 * Legacy 预售 tables → the new presale schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                                   | New                      |
 * | ---------------------------------------- | ------------------------ |
 * | `eb_store_advance`                       | `presale_activities`     |
 * | `eb_store_product_attr_value` (`type=6`) | `presale_activity_skus`  |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock, so the test beside it runs on literal rows
 * copied out of the legacy dump.
 *
 * **`presale_orders` is deliberately NOT produced here.** A presale order is an
 * ordinary `eb_store_order` row carrying `advance_id`; the link belongs to
 * whoever migrates orders, and its `stage` is a function of the order's own
 * status, which this mapper cannot see. `legacyPresaleOrderCount` is reported
 * so the number is in the cutover log rather than discovered afterwards.
 *
 * ## 定金预售 arrives paused
 *
 * `type = 1` (定金 + 尾款) migrates with its `deposit` and both 尾款 windows
 * intact — the columns exist, `SCHEMA.md` §6.3 keeps them, and the data is the
 * operator's — but the campaign is imported as `paused`, whatever legacy's
 * `status` said. The domain refuses a deposit order outright
 * (`PRESALE_DEPOSIT_NOT_SUPPORTED`), so leaving one on the shelf would put a
 * campaign in front of shoppers that nothing can sell. Paused is the honest
 * state: the operator sees it, the data is all there, and nobody is offered
 * something they cannot buy. `activitiesPausedDeposit` counts them.
 *
 * A deposit row whose legacy data does not satisfy
 * `presale_activities_deposit_shape` — no deposit, a deposit at or above the
 * price, a missing or reversed 尾款 window — cannot be stored as `deposit` at
 * all. It becomes a paused full-payment campaign with the deposit dropped, and
 * `activitiesDepositRepaired` counts that separately, because it is the one
 * case where a number the operator typed does not survive.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_store_advance` — one 预售 campaign. */
export interface LegacyAdvance {
  id: number;
  product_id: number;
  image: string;
  /** Comma-separated, or a JSON array in some dumps. */
  images: string;
  title: string;
  info: string;
  price: string;
  ot_price: string;
  sort: number;
  stock: number;
  sales: number;
  unit_name?: string;
  /** `varchar` in legacy: unix seconds as a string. */
  start_time: string | number;
  stop_time: string | number;
  add_time: string | number;
  /** 商品状态: 1 = on the shelf. */
  status: number;
  is_del: number;
  /** 0 = 全款, 1 = 定金. */
  type: number;
  deposit: string;
  /** 尾款支付开始/结束时间, unix seconds as a string. */
  pay_start_time: string | number;
  pay_stop_time: string | number;
  /** 付款后几天后发货. */
  deliver_time: number;
  /** 最多购买几个. */
  num: number;
  temp_id: number;
  /** 限购总数; `0` = unlimited. */
  quota: number;
  quota_show: number;
  /** 单次购买个数. Legacy read `num` in one place and this in another. */
  once_num: number;
}

/** `eb_store_product_attr_value` rows with `type = 6`; `product_id` is the *advance* id. */
export interface LegacyAdvanceSku {
  id: number;
  /** The `eb_store_advance.id`, not a product id. Legacy overloads the column. */
  product_id: number;
  suk: string;
  price: string;
  stock: number;
  sales: number;
  quota: number;
  type: number;
}

/**
 * What the catalog mapper produced. The presale SKU rows point at the real
 * `product_skus`, so they are matched by `(productId, specText)` — legacy's
 * `suk` — which is exactly the pair `product_skus_spec_uq` makes unique.
 */
export interface MappedProductSku {
  id: number;
  productId: number;
  specText: string;
}

// ---------------------------------------------------------------------------
// output row shapes
// ---------------------------------------------------------------------------

export type PresaleActivityStatus = 'draft' | 'active' | 'paused' | 'ended';
export type PresalePaymentMode = 'full' | 'deposit';

export interface PresaleActivityRow {
  id: number;
  productId: number;
  title: string;
  intro: string | null;
  imageUrl: string | null;
  sliderImages: string[];
  status: PresaleActivityStatus;
  paymentMode: PresalePaymentMode;
  price: string;
  originalPrice: string | null;
  depositAmount: string | null;
  stock: number;
  sales: number;
  totalQuota: number | null;
  perOrderQuantity: number;
  startAt: Date;
  endAt: Date;
  finalPaymentStartAt: Date | null;
  finalPaymentEndAt: Date | null;
  shipAfterDays: number;
  shippingTemplateId: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PresaleActivitySkuRow {
  activityId: number;
  skuId: number;
  price: string;
  depositAmount: string | null;
  stock: number;
  sales: number;
  quota: number | null;
  isEnabled: boolean;
}

/** Why a row was not migrated as it stood. Every count is reported, never swallowed. */
export interface PresaleMigrationReport {
  activities: number;
  activitiesDroppedDeleted: number;
  /** The product is gone, and `product_id` is a restricting foreign key. */
  activitiesDroppedUnknownProduct: number;
  /** `stop_time <= start_time` — `presale_activities_window_ordered`. */
  activitiesWindowRepaired: number;
  /** 定金预售, imported paused because nothing can sell it. */
  activitiesPausedDeposit: number;
  /** 定金预售 whose deposit could not be stored at all; became full-payment. */
  activitiesDepositRepaired: number;
  activitySkus: number;
  activitySkusDroppedUnknownSku: number;
  /** 单位名 has no column in the new schema. */
  unitNamesDropped: number;
  /** `presale_orders` is not produced here; this is how many were skipped. */
  presaleOrdersSkipped: number;
  droppedActivityIds: number[];
}

export interface PresaleMigrationInput {
  advances: readonly LegacyAdvance[];
  /** `eb_store_product_attr_value`; rows with `type !== 6` are ignored. */
  advanceSkus?: readonly LegacyAdvanceSku[];
  /** The catalog mapper's SKU rows, for the `(productId, suk)` match. */
  productSkus?: readonly MappedProductSku[];
  /** Product ids that survived the catalog migration. */
  keptProductIds?: ReadonlySet<number>;
  /** Legacy orders carrying an `advance_id`, reported so the number is logged. */
  legacyPresaleOrderCount?: number;
  /** The timestamp rows without one get. Defaults to the epoch of the dump. */
  migratedAt?: Date;
}

export interface PresaleMigrationOutput {
  activities: PresaleActivityRow[];
  activitySkus: PresaleActivitySkuRow[];
  report: PresaleMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Legacy unix seconds; `0` and `''` are the legacy ways of saying NULL. */
function instant(seconds: number | string | undefined): Date | null {
  const value = typeof seconds === 'string' ? Number(seconds) : seconds;
  return value !== undefined && Number.isFinite(value) && value > 0 ? new Date(value * 1000) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** `'0.00'`, `'0'` and `''` all mean "no amount" in the legacy dump. */
function moneyOrNull(value: string | number | null | undefined): string | null {
  const raw = blankToNull(typeof value === 'number' ? String(value) : value);
  if (raw === null) return null;
  return Number(raw) > 0 ? raw : null;
}

/** `images` is a comma-separated list in most dumps and a JSON array in some. */
export function parseSliderImages(raw: string): string[] {
  const value = (raw ?? '').trim();
  if (value === '') return [];
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item !== '');
      }
    } catch {
      // Fall through to the comma-separated reading.
    }
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * `status` / the clock → the four-state status.
 *
 * Legacy had one boolean and inferred "over" from the clock, which is why an
 * ended campaign still answered `status = 1` forever. Here a campaign whose
 * window has closed is `ended`, which is what the window sweep would have
 * written and what the admin list must show.
 */
function statusOf(row: LegacyAdvance, endAt: Date, now: Date): PresaleActivityStatus {
  if (row.status !== 1) return 'paused';
  if (endAt.getTime() <= now.getTime()) return 'ended';
  return 'active';
}

/**
 * The deposit half of a 定金预售, or `null` when it cannot be stored.
 *
 * `presale_activities_deposit_shape` wants all four together: a deposit below
 * the price, and a 尾款 window that is ordered. Legacy enforced none of it.
 */
function depositShapeOf(
  row: LegacyAdvance,
): { depositAmount: string; finalPaymentStartAt: Date; finalPaymentEndAt: Date } | null {
  const depositAmount = moneyOrNull(row.deposit);
  if (depositAmount === null) return null;
  if (Number(depositAmount) >= Number(row.price)) return null;
  const finalPaymentStartAt = instant(row.pay_start_time);
  const finalPaymentEndAt = instant(row.pay_stop_time);
  if (finalPaymentStartAt === null || finalPaymentEndAt === null) return null;
  if (finalPaymentEndAt.getTime() <= finalPaymentStartAt.getTime()) return null;
  return { depositAmount, finalPaymentStartAt, finalPaymentEndAt };
}

export function mapPresale(input: PresaleMigrationInput): PresaleMigrationOutput {
  const migratedAt = input.migratedAt ?? new Date('2026-01-01T00:00:00.000Z');
  const activities: PresaleActivityRow[] = [];
  const activitySkus: PresaleActivitySkuRow[] = [];
  const report: PresaleMigrationReport = {
    activities: 0,
    activitiesDroppedDeleted: 0,
    activitiesDroppedUnknownProduct: 0,
    activitiesWindowRepaired: 0,
    activitiesPausedDeposit: 0,
    activitiesDepositRepaired: 0,
    activitySkus: 0,
    activitySkusDroppedUnknownSku: 0,
    unitNamesDropped: 0,
    presaleOrdersSkipped: input.legacyPresaleOrderCount ?? 0,
    droppedActivityIds: [],
  };

  // `(productId, specText)` → the new SKU id.
  const skuByProductAndSpec = new Map<string, number>();
  for (const sku of input.productSkus ?? []) {
    skuByProductAndSpec.set(`${sku.productId}:${sku.specText.trim()}`, sku.id);
  }

  const skusByAdvance = new Map<number, LegacyAdvanceSku[]>();
  for (const row of input.advanceSkus ?? []) {
    if (row.type !== 6) continue;
    const list = skusByAdvance.get(row.product_id);
    if (list) list.push(row);
    else skusByAdvance.set(row.product_id, [row]);
  }

  for (const row of [...input.advances].sort((a, b) => a.id - b.id)) {
    if (row.is_del === 1) {
      report.activitiesDroppedDeleted += 1;
      report.droppedActivityIds.push(row.id);
      continue;
    }
    if (input.keptProductIds && !input.keptProductIds.has(row.product_id)) {
      report.activitiesDroppedUnknownProduct += 1;
      report.droppedActivityIds.push(row.id);
      continue;
    }

    const createdAt = instant(row.add_time) ?? migratedAt;
    const startAt = instant(row.start_time) ?? createdAt;
    let endAt = instant(row.stop_time);
    if (endAt === null || endAt.getTime() <= startAt.getTime()) {
      // `presale_activities_window_ordered`. A campaign with no end, or one
      // that ends before it starts, becomes a campaign that closed a day after
      // it opened — which for a legacy dump is the past, so it reads as `ended`
      // in the admin list rather than staying silently live forever.
      endAt = new Date(startAt.getTime() + DAY_MS);
      report.activitiesWindowRepaired += 1;
    }

    const deposit = row.type === 1 ? depositShapeOf(row) : null;
    if (row.type === 1) {
      report.activitiesPausedDeposit += 1;
      if (deposit === null) report.activitiesDepositRepaired += 1;
    }
    if (blankToNull(row.unit_name) !== null) report.unitNamesDropped += 1;

    activities.push({
      id: row.id,
      productId: row.product_id,
      title: row.title.trim().slice(0, 255),
      intro: blankToNull(row.info)?.slice(0, 255) ?? null,
      imageUrl: blankToNull(row.image),
      sliderImages: parseSliderImages(row.images),
      // A deposit campaign nothing can sell does not belong on the shelf.
      status: deposit === null && row.type !== 1 ? statusOf(row, endAt, migratedAt) : 'paused',
      paymentMode: deposit === null ? 'full' : 'deposit',
      price: row.price,
      originalPrice: moneyOrNull(row.ot_price),
      depositAmount: deposit?.depositAmount ?? null,
      stock: Math.max(0, row.stock),
      sales: Math.max(0, row.sales),
      // `quota` is legacy's *remaining* limit and `quota_show` the original.
      // The new column is the ceiling, so it is `quota_show` when there is one.
      totalQuota: row.quota_show > 0 ? row.quota_show : row.quota > 0 ? row.quota : null,
      // 最多购买几个 first, 单次购买个数 second: legacy's own order service read
      // `num`, and `presale_activities_per_order_positive` insists on at least 1.
      perOrderQuantity: row.num > 0 ? row.num : row.once_num > 0 ? row.once_num : 1,
      startAt,
      endAt,
      finalPaymentStartAt: deposit?.finalPaymentStartAt ?? null,
      finalPaymentEndAt: deposit?.finalPaymentEndAt ?? null,
      shipAfterDays: Math.max(0, row.deliver_time),
      shippingTemplateId: row.temp_id > 0 ? row.temp_id : null,
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    report.activities += 1;

    for (const sku of (skusByAdvance.get(row.id) ?? []).sort((a, b) => a.id - b.id)) {
      const skuId = skuByProductAndSpec.get(`${row.product_id}:${sku.suk.trim()}`);
      if (skuId === undefined) {
        // The variant was renamed or deleted on the product after the campaign
        // was built. Legacy would have sold it at the product price; here the
        // campaign simply does not offer it.
        report.activitySkusDroppedUnknownSku += 1;
        continue;
      }
      activitySkus.push({
        activityId: row.id,
        skuId,
        price: sku.price,
        // The per-SKU deposit is a column the legacy attr table does not have;
        // a deposit campaign carries one figure, on the activity.
        depositAmount: null,
        stock: Math.max(0, sku.stock),
        sales: Math.max(0, sku.sales),
        quota: sku.quota > 0 ? sku.quota : null,
        isEnabled: true,
      });
      report.activitySkus += 1;
    }
  }

  return { activities, activitySkus, report };
}
