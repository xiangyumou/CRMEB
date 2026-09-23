import type { ProductCard } from '@shop/contracts/catalog/schemas';
import type { ClaimableCoupon } from '@shop/contracts/coupon/schemas';
import type { ArticleListItem } from '@shop/contracts/cms/schemas';
import type {
  ArticleSummary,
  CouponSummary,
  CouponUserState,
  DataNeed,
  DataNeedKind,
  ProductSource,
  ProductSummary,
  ResolvedByKind,
} from '@shop/contracts/decor/sources';

import * as catalog from '../catalog';
import { articles } from '../cms';
import * as coupon from '../coupon';
import * as groupbuy from '../groupbuy';
import type { Ctx } from '../kernel/context';
import * as presale from '../presale';

/**
 * The per-need resolver registry (plan §2.1).
 *
 * A block declares *what* it needs (`DataNeed`, from its `defineBlock({ data })`);
 * one resolver per need kind answers it, through the owning domain's public
 * `index.ts` and nothing else. The page resolver calls these with an
 * anonymous context, so what they return is the same for every shopper and
 * can be cached; per-shopper state is `personalResolvers`' job.
 *
 * What the shopper can see is each domain's rule, not ours: products on the
 * shelf, coupons claimable now, campaigns inside their window, published
 * articles. Anything else is silently left out (DECOR-013).
 */

export type NeedOf<K extends DataNeedKind> = Extract<DataNeed, { kind: K }>;

export type DataResolvers = {
  [K in DataNeedKind]: (ctx: Ctx, need: NeedOf<K>) => Promise<ResolvedByKind[K]>;
};

/** A catalog product card as a block receives it. */
export function toProductSummary(card: ProductCard): ProductSummary {
  const summary: ProductSummary = {
    id: card.id,
    title: card.name,
    image: card.cardImageUrl ?? card.imageUrl,
    price: card.price,
  };
  if (card.originalPrice !== null && Number(card.originalPrice) > Number(card.price)) {
    summary.marketPrice = card.originalPrice;
  }
  const tag = card.labels[0]?.name;
  if (tag) summary.tag = [...tag].slice(0, 8).join('');
  if (card.stock <= 0) summary.soldOut = true;
  return summary;
}

const SORTS = {
  default: {},
  sales: { sortBy: 'sales', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  priceAsc: { sortBy: 'price', sortOrder: 'asc' },
  priceDesc: { sortBy: 'price', sortOrder: 'desc' },
} as const;

/**
 * Products for a source (DECOR-013).
 *
 * - `manual`: the operator's list in its order, skipping what is off the shelf
 *   or deleted, and keeping a sold-out product (marked `soldOut`): the
 *   operator chose it, and it will be back.
 * - `category` / `label`: the rule, re-run: on-shelf products *with stock*
 *   only, in the chosen order, at most `limit`. The catalog is asked for a few
 *   more than `limit` so sold-out products can be dropped without coming up short.
 */
export async function resolveProducts(ctx: Ctx, source: ProductSource): Promise<ProductSummary[]> {
  if (source.mode === 'manual') {
    if (source.ids.length === 0) return [];
    const cards = await catalog.productCardsFor(ctx, source.ids.map(Number));
    return cards.map(toProductSummary);
  }
  const { items } = await catalog.productList(ctx, {
    page: 1,
    pageSize: Math.min(100, source.limit * 2 + 10),
    ...(source.mode === 'category'
      ? { categoryId: source.categoryId }
      : { labelId: source.labelId }),
    ...SORTS[source.sort],
  });
  return items
    .filter((card) => card.stock > 0)
    .slice(0, source.limit)
    .map(toProductSummary);
}

export function toCouponSummary(item: ClaimableCoupon): CouponSummary {
  const { claimedCount: _claimed, canClaim: _canClaim, ...rest } = item;
  return rest;
}

function toArticleSummary(item: ArticleListItem): ArticleSummary {
  return {
    id: item.id,
    title: item.title,
    coverImageUrl: item.coverImageUrl,
    summary: item.summary,
    author: item.author,
    categoryTitle: item.categoryTitle,
    views: item.views,
    publishedAt: item.publishedAt,
  };
}

/** Keeps `items` whose id is in `ids`, in the order of `ids`. */
function pick<T>(items: readonly T[], ids: readonly string[], idOf: (item: T) => string): T[] {
  const byId = new Map(items.map((item) => [idOf(item), item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
}

/** The campaign lists have no id filter; a manual pick reads one full page and picks. */
const CAMPAIGN_PAGE = 100;

export const defaultResolvers: DataResolvers = {
  products: (ctx, need) => resolveProducts(ctx, need.source),

  async coupons(ctx, need) {
    const source = need.source;
    if (source.mode === 'manual' && source.ids.length === 0) return [];
    const { items } = await coupon.listClaimable(
      ctx,
      source.mode === 'manual'
        ? { page: 1, pageSize: source.ids.length, ids: source.ids }
        : { page: 1, pageSize: source.limit },
    );
    return items.map(toCouponSummary);
  },

  async newUserCoupons(ctx, need) {
    const { items } = await coupon.listNewUser(ctx);
    return items.slice(0, need.limit).map(toCouponSummary);
  },

  async groupbuys(ctx, need) {
    const source = need.source;
    if (source.mode === 'manual') {
      if (source.ids.length === 0) return [];
      const { items } = await groupbuy.list(ctx, { page: 1, pageSize: CAMPAIGN_PAGE });
      return pick(items, source.ids, (item) => item.activityId);
    }
    return (await groupbuy.list(ctx, { page: 1, pageSize: source.limit })).items;
  },

  async presales(ctx, need) {
    const source = need.source;
    if (source.mode === 'manual') {
      if (source.ids.length === 0) return [];
      const { items } = await presale.list(ctx, { page: 1, pageSize: CAMPAIGN_PAGE });
      return pick(items, source.ids, (item) => item.activityId);
    }
    return (await presale.list(ctx, { page: 1, pageSize: source.limit })).items;
  },

  async articles(ctx, need) {
    const source = need.source;
    if (source.mode === 'manual') {
      if (source.ids.length === 0) return [];
      const { items } = await articles.publicList(ctx, {
        page: 1,
        pageSize: source.ids.length,
        ids: source.ids,
      });
      return items.map(toArticleSummary);
    }
    const { items } = await articles.publicList(ctx, {
      page: 1,
      pageSize: source.limit,
      ...(source.categoryId === undefined ? {} : { categoryId: source.categoryId }),
    });
    return items.map(toArticleSummary);
  },
};

/**
 * Per-shopper coupon state for the templates a page shows, in one call per
 * list (DECOR-015). `ctx` is the shopper's own; never cached.
 */
export async function couponStatesFor(
  ctx: Ctx,
  input: { claimable: readonly string[]; newUser: readonly string[] },
): Promise<Map<string, CouponUserState>> {
  const states = new Map<string, CouponUserState>();
  const record = (item: ClaimableCoupon) => {
    if (item.claimedCount === null || item.canClaim === null) return;
    states.set(item.templateId, {
      templateId: item.templateId,
      claimedCount: item.claimedCount,
      canClaim: item.canClaim,
    });
  };
  if (input.claimable.length > 0) {
    const ids = [...new Set(input.claimable)];
    const { items } = await coupon.listClaimable(ctx, { page: 1, pageSize: ids.length, ids });
    items.forEach(record);
  }
  if (input.newUser.length > 0) {
    const { items } = await coupon.listNewUser(ctx);
    items.forEach(record);
  }
  return states;
}
