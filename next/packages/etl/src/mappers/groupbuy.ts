/**
 * Legacy 拼团 tables → the new group-buy schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                                   | New                        |
 * | ---------------------------------------- | -------------------------- |
 * | `eb_store_combination`                   | `groupbuy_activities`      |
 * | `eb_store_product_attr_value` (`type=3`) | `groupbuy_activity_skus`   |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock, so the test beside it runs on literal rows
 * copied out of the legacy dump.
 *
 * **`eb_store_pink` is deliberately NOT migrated.** It holds the teams
 * themselves — who joined which team, whether it completed. Three reasons it
 * does not come across:
 *
 *  1. every row in it points at a legacy order (`order_id`, `order_id_key`),
 *     and a team is only meaningful while its orders are; the new
 *     `groupbuy_members.order_id` is `NOT NULL` and references `orders`;
 *  2. the teams that matter are `forming`, and a forming team is a live clock.
 *     Restoring one into a database whose effects ledger has no timer for it
 *     would produce a team that can never expire;
 *  3. the completed ones are history the order already records — the shopper's
 *     order says what they bought and at what price, which is what an
 *     after-sales question is ever about.
 *
 * The migration therefore starts every campaign with no open teams. The runner
 * is expected to run the cutover with 拼团 paused; `SCHEMA.md` §6.2 says the
 * same about seckill.
 *
 * Two legacy columns are read and dropped, counted rather than swallowed:
 *
 *  - `virtual` (虚拟成团百分比) — the new switch is shop-wide and boolean
 *    (`groupbuy.virtualFillOnExpiry`, **CR-2-d**), so a per-campaign percentage
 *    has nowhere to go;
 *  - `is_commission` / `head_commission` (团长佣金) — the commission feature is
 *    not in the rewrite's scope.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_store_combination` — one 拼团 campaign. */
export interface LegacyCombination {
  id: number;
  product_id: number;
  title: string;
  info: string;
  image: string;
  /** Comma-separated, or a JSON array in some dumps. */
  images: string;
  /** Heads needed to complete a team. */
  people: number;
  price: string;
  cost: string | number;
  sort: number;
  sales: number;
  stock: number;
  /** Unix seconds. */
  start_time: number;
  stop_time: number;
  /** Hours a team stays open. `0` means the legacy default of 24. */
  effective_time: number;
  /** Units one order may buy. `0` means "no limit", which is 1 here. */
  once_num: number;
  /** 限购总数. `0` = unlimited. */
  quota: number;
  quota_show: number;
  /** 虚拟成团百分比 — dropped, see the header. */
  virtual?: number;
  is_commission?: number;
  browse?: number;
  temp_id?: number;
  /** 1 = the shopper sees it. */
  is_show: number;
  is_del: number;
  /** `varchar` in legacy: unix seconds as a string. */
  add_time: string | number;
}

/** `eb_store_product_attr_value` rows with `type = 3`; `product_id` is the *combination* id. */
export interface LegacyCombinationSku {
  id: number;
  /** The `eb_store_combination.id`, not a product id. Legacy overloads the column. */
  product_id: number;
  suk: string;
  price: string;
  stock: number;
  sales: number;
  quota: number;
  type: number;
}

/**
 * What the catalog mapper produced. The group-buy SKU rows point at the real
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

export type GroupbuyActivityStatus = 'draft' | 'active' | 'paused' | 'ended';

export interface GroupbuyActivityRow {
  id: number;
  productId: number;
  title: string;
  intro: string | null;
  imageUrl: string | null;
  sliderImages: string[];
  status: GroupbuyActivityStatus;
  price: string;
  originalPrice: string | null;
  cost: string | null;
  seatsRequired: number;
  groupTtlSeconds: number;
  stock: number;
  sales: number;
  totalQuota: number | null;
  perOrderQuantity: number;
  startAt: Date;
  endAt: Date;
  shippingTemplateId: number | null;
  views: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface GroupbuyActivitySkuRow {
  activityId: number;
  skuId: number;
  price: string;
  stock: number;
  sales: number;
  quota: number | null;
  isEnabled: boolean;
}

/** Why a row was not migrated. Every count here is reported, never swallowed. */
export interface GroupbuyMigrationReport {
  activities: number;
  activitiesDroppedDeleted: number;
  /** `people < 2` — `groupbuy_activities_seats_required` would refuse it. */
  activitiesDroppedSeats: number;
  /** The product is gone, and `product_id` is a restricting foreign key. */
  activitiesDroppedUnknownProduct: number;
  /** `stop_time <= start_time` — `groupbuy_activities_window_ordered`. */
  activitiesWindowRepaired: number;
  activitySkus: number;
  activitySkusDroppedUnknownSku: number;
  /** 虚拟成团百分比 became a shop-wide boolean (CR-2-d). */
  virtualPercentagesDropped: number;
  /** 团长佣金, out of scope. */
  headCommissionsDropped: number;
  /** `eb_store_pink` is not migrated at all; this is how many rows were skipped. */
  teamsSkipped: number;
  droppedActivityIds: number[];
}

export interface GroupbuyMigrationInput {
  combinations: readonly LegacyCombination[];
  /** `eb_store_product_attr_value`; rows with `type !== 3` are ignored. */
  combinationSkus?: readonly LegacyCombinationSku[];
  /** The catalog mapper's SKU rows, for the `(productId, suk)` match. */
  productSkus?: readonly MappedProductSku[];
  /** Product ids that survived the catalog migration. */
  keptProductIds?: ReadonlySet<number>;
  /** `eb_store_pink` row count, reported so the number is in the log. */
  legacyTeamCount?: number;
  /** The timestamp rows without one get. Defaults to the epoch of the dump. */
  migratedAt?: Date;
}

export interface GroupbuyMigrationOutput {
  activities: GroupbuyActivityRow[];
  activitySkus: GroupbuyActivitySkuRow[];
  report: GroupbuyMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TTL_HOURS = 24;

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number | string): Date | null {
  const value = typeof seconds === 'string' ? Number(seconds) : seconds;
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
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
 * `is_show` / `is_del` → the four-state status.
 *
 * Legacy had two booleans and inferred "over" from the clock, which is why an
 * ended campaign still answered `is_show = 1` forever. Here a campaign whose
 * window has closed is `ended`, which is what the admin list must show.
 */
function statusOf(row: LegacyCombination, endAt: Date, now: Date): GroupbuyActivityStatus {
  if (row.is_show !== 1) return 'paused';
  if (endAt.getTime() <= now.getTime()) return 'ended';
  return 'active';
}

export function mapGroupbuy(input: GroupbuyMigrationInput): GroupbuyMigrationOutput {
  const migratedAt = input.migratedAt ?? new Date('2026-01-01T00:00:00.000Z');
  const activities: GroupbuyActivityRow[] = [];
  const activitySkus: GroupbuyActivitySkuRow[] = [];
  const report: GroupbuyMigrationReport = {
    activities: 0,
    activitiesDroppedDeleted: 0,
    activitiesDroppedSeats: 0,
    activitiesDroppedUnknownProduct: 0,
    activitiesWindowRepaired: 0,
    activitySkus: 0,
    activitySkusDroppedUnknownSku: 0,
    virtualPercentagesDropped: 0,
    headCommissionsDropped: 0,
    teamsSkipped: input.legacyTeamCount ?? 0,
    droppedActivityIds: [],
  };

  // `(productId, specText)` → the new SKU id.
  const skuByProductAndSpec = new Map<string, number>();
  for (const sku of input.productSkus ?? []) {
    skuByProductAndSpec.set(`${sku.productId}:${sku.specText.trim()}`, sku.id);
  }

  const skusByCombination = new Map<number, LegacyCombinationSku[]>();
  for (const row of input.combinationSkus ?? []) {
    if (row.type !== 3) continue;
    const list = skusByCombination.get(row.product_id);
    if (list) list.push(row);
    else skusByCombination.set(row.product_id, [row]);
  }

  for (const row of [...input.combinations].sort((a, b) => a.id - b.id)) {
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
    // `groupbuy_activities_seats_required` says a team is at least two people.
    // Legacy allowed `people = 1`, which is a campaign that completes itself.
    if (row.people < 2) {
      report.activitiesDroppedSeats += 1;
      report.droppedActivityIds.push(row.id);
      continue;
    }

    const createdAt = instant(row.add_time) ?? migratedAt;
    const startAt = instant(row.start_time) ?? createdAt;
    let endAt = instant(row.stop_time);
    if (endAt === null || endAt.getTime() <= startAt.getTime()) {
      // `groupbuy_activities_window_ordered`. A campaign with no end, or one
      // that ends before it starts, becomes a campaign that ended the day it
      // started — visible in the admin list as `ended` rather than silently
      // live forever.
      endAt = new Date(startAt.getTime() + 24 * HOUR_MS);
      report.activitiesWindowRepaired += 1;
    }

    if ((row.virtual ?? 100) !== 100) report.virtualPercentagesDropped += 1;
    if ((row.is_commission ?? 0) === 1) report.headCommissionsDropped += 1;

    const ttlHours = row.effective_time > 0 ? row.effective_time : DEFAULT_TTL_HOURS;
    const cost = typeof row.cost === 'number' ? String(row.cost) : blankToNull(row.cost);

    activities.push({
      id: row.id,
      productId: row.product_id,
      title: row.title.trim().slice(0, 255),
      intro: blankToNull(row.info)?.slice(0, 255) ?? null,
      imageUrl: blankToNull(row.image),
      sliderImages: parseSliderImages(row.images),
      status: statusOf(row, endAt, migratedAt),
      price: row.price,
      // Legacy kept no activity-level original price; the product's own price
      // is what 划线价 showed, and the storefront reads it from the product.
      originalPrice: null,
      cost: cost === '0' ? null : cost,
      seatsRequired: row.people,
      groupTtlSeconds: ttlHours * 3_600,
      stock: Math.max(0, row.stock),
      sales: Math.max(0, row.sales),
      // `quota` is legacy's *remaining* limit and `quota_show` the original.
      // The new column is the ceiling, so it is `quota_show` when there is one.
      totalQuota: row.quota_show > 0 ? row.quota_show : row.quota > 0 ? row.quota : null,
      perOrderQuantity: row.once_num > 0 ? row.once_num : 1,
      startAt,
      endAt,
      shippingTemplateId: row.temp_id && row.temp_id > 0 ? row.temp_id : null,
      views: Math.max(0, row.browse ?? 0),
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
    report.activities += 1;

    for (const sku of (skusByCombination.get(row.id) ?? []).sort((a, b) => a.id - b.id)) {
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
