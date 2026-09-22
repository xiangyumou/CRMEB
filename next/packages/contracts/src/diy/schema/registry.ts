import { z } from 'zod';

import { articleListSchema } from './articleList.schema';
import { blankPageSchema } from './blankPage.schema';
import { bottomMenuSchema } from './bottomMenu.schema';
import { combinationSchema } from './combination.schema';
import { couponSchema } from './coupon.schema';
import { customComponentSchema } from './customComponent.schema';
import { customerServiceSchema } from './customerService.schema';
import { followSchema } from './follow.schema';
import { goodListSchema } from './goodList.schema';
import { goodRecommendSchema } from './goodRecommend.schema';
import { guideSchema } from './guide.schema';
import { headerSerchSchema } from './headerSerch.schema';
import { homeCombSchema } from './homeComb.schema';
import { hotspotSchema } from './hotspot.schema';
import { memberSchema } from './member.schema';
import { menusSchema } from './menus.schema';
import { newsSchema } from './news.schema';
import { newVipSchema } from './newVip.schema';
import { pageFootSchema } from './pageFoot.schema';
import { pictureCubeSchema } from './pictureCube.schema';
import { presaleSchema } from './presale.schema';
import { productDescSchema } from './productDesc.schema';
import { productInfoSchema } from './productInfo.schema';
import { productServiceSchema } from './productService.schema';
import { promotionListSchema } from './promotionList.schema';
import { reviewsSchema } from './reviews.schema';
import { richTextSchema } from './richText.schema';
import { swiperBgSchema } from './swiperBg.schema';
import { swipersSchema } from './swipers.schema';
import { tabNavSchema } from './tabNav.schema';
import { titlesSchema } from './titles.schema';
import { userInforSchema } from './userInfor.schema';
import { videosSchema } from './videos.schema';

/**
 * Every component key the decoration editor or the storefront renderer knows.
 *
 * The two legacy registries disagree by one entry and both are right:
 * `template/admin/src/utils/diyRegistry.js` lists 33 keys (the editor palette
 * plus `bottomMenu`, which the product-detail page consumes through
 * `productBottom.vue`), `template/uni-app/utils/diyRegistry.js` lists 32 (no
 * `bottomMenu`). Anything not in this table is legacy data to be stripped — see
 * `REMOVED_COMPONENT_KEYS`.
 */
export const diyComponentSchemas = {
  userInfor: userInforSchema,
  member: memberSchema,
  articleList: articleListSchema,
  blankPage: blankPageSchema,
  newVip: newVipSchema,
  combination: combinationSchema,
  coupon: couponSchema,
  customerService: customerServiceSchema,
  goodList: goodListSchema,
  goodRecommend: goodRecommendSchema,
  guide: guideSchema,
  menus: menusSchema,
  news: newsSchema,
  pictureCube: pictureCubeSchema,
  promotionList: promotionListSchema,
  swiperBg: swiperBgSchema,
  swipers: swipersSchema,
  titles: titlesSchema,
  presale: presaleSchema,
  richText: richTextSchema,
  videos: videosSchema,
  hotspot: hotspotSchema,
  follow: followSchema,
  productInfo: productInfoSchema,
  productService: productServiceSchema,
  reviews: reviewsSchema,
  productDesc: productDescSchema,
  customComponent: customComponentSchema,
  pageFoot: pageFootSchema,
  bottomMenu: bottomMenuSchema,
  homeComb: homeCombSchema,
  headerSerch: headerSerchSchema,
  tabNav: tabNavSchema,
} as const;

export type DiyComponentKey = keyof typeof diyComponentSchemas;

/** Stable order: the admin palette order of `retainedDiyNames`. */
export const DIY_COMPONENT_KEYS = Object.keys(diyComponentSchemas) as DiyComponentKey[];

/**
 * Keys the storefront renders but the editor cannot create.
 *
 * `newVip` and `presale` have a config panel but no preview component;
 * `swipers` has neither yet still has a live branch in `pageDesign.vue:134`.
 * They only reach a page through legacy saved data.
 */
export const RENDER_ONLY_COMPONENT_KEYS = ['newVip', 'presale', 'swipers'] as const;

/** `bottomMenu` is consumed by `productBottom.vue`, not by the page dispatcher. */
export const ADMIN_ONLY_COMPONENT_KEYS = ['bottomMenu'] as const;

/**
 * Keys the editor palette offers. `pageFoot` and `bottomMenu` are singletons
 * owned by the page settings rather than draggable palette entries.
 *
 * `customComponent` (超级组件) is excluded for a third reason (CR-2-g2, option
 * 3): its inner layout is drawn in a second drag-and-drop designer
 * (`template/admin/src/components/CustomDesign/`) that this rewrite does not
 * build, so a freshly created one would render nothing and could never be
 * filled. It stays renderable, keeps its config panel and round-trips its
 * `customComponents` tree untouched — existing nodes remain fully editable.
 */
export const CREATABLE_COMPONENT_KEYS = DIY_COMPONENT_KEYS.filter(
  (key) =>
    !(RENDER_ONLY_COMPONENT_KEYS as readonly string[]).includes(key) &&
    key !== 'pageFoot' &&
    key !== 'bottomMenu' &&
    key !== 'customComponent',
);

/** Keys `pageDesign.vue` will render. Mirrors uni `diyComponentNames`. */
export const RENDERABLE_COMPONENT_KEYS = DIY_COMPONENT_KEYS.filter(
  (key) => !(ADMIN_ONLY_COMPONENT_KEYS as readonly string[]).includes(key),
);

export function isDiyComponentKey(value: unknown): value is DiyComponentKey {
  return typeof value === 'string' && Object.hasOwn(diyComponentSchemas, value);
}

/**
 * A single node of a saved page.
 *
 * Neither a discriminated union nor a plain union.
 *
 * A discriminated union cannot work: production pages contain nodes whose
 * `name` we deliberately no longer model (`bargain`, `seckill`, …) and will
 * contain nodes from editor builds newer than this code. Those must still parse
 * and round-trip; stripping is a separate, explicit step
 * (`@shop/core/diy` `cleanDiyData`), exactly as the PHP does it on read rather
 * than on write.
 *
 * A plain union with a permissive last member is worse than useless: every
 * malformed known component would quietly match the catch-all, so nothing would
 * ever be validated. Instead the node is parsed as "some object", then the
 * registered schema for its `name` is applied and its issues are re-raised at
 * the right path.
 */
const diyAnyNode = z.looseObject({ name: z.string().optional() });

export const diyComponentNode = diyAnyNode.check((ctx) => {
  const name = (ctx.value as { name?: unknown }).name;
  if (!isDiyComponentKey(name)) return;
  const result = diyComponentSchemas[name].safeParse(ctx.value);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.issues.push({
      code: 'custom',
      input: ctx.value,
      path: issue.path,
      message: issue.message,
    });
  }
});
export type DiyComponentNode = z.infer<typeof diyComponentNode>;
