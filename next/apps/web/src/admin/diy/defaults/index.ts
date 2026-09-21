/**
 * Factory defaults for every component the editor can create.
 *
 * Generated once from the legacy Vue editor; hand-maintained from here on.
 * A panel reaches its own default through `createDefault` — this map is for
 * the palette and for `resetComponent`.
 */

import { articleListDefault } from './articleList.default';
import { blankPageDefault } from './blankPage.default';
import { bottomMenuDefault } from './bottomMenu.default';
import { combinationDefault } from './combination.default';
import { couponDefault } from './coupon.default';
import { customComponentDefault } from './customComponent.default';
import { customerServiceDefault } from './customerService.default';
import { followDefault } from './follow.default';
import { goodListDefault } from './goodList.default';
import { goodRecommendDefault } from './goodRecommend.default';
import { guideDefault } from './guide.default';
import { headerSerchDefault } from './headerSerch.default';
import { homeCombDefault } from './homeComb.default';
import { hotspotDefault } from './hotspot.default';
import { memberDefault } from './member.default';
import { menusDefault } from './menus.default';
import { newsDefault } from './news.default';
import { pageFootDefault } from './pageFoot.default';
import { pictureCubeDefault } from './pictureCube.default';
import { productDescDefault } from './productDesc.default';
import { productInfoDefault } from './productInfo.default';
import { productServiceDefault } from './productService.default';
import { promotionListDefault } from './promotionList.default';
import { reviewsDefault } from './reviews.default';
import { richTextDefault } from './richText.default';
import { swiperBgDefault } from './swiperBg.default';
import { tabNavDefault } from './tabNav.default';
import { titlesDefault } from './titles.default';
import { userInforDefault } from './userInfor.default';
import { videosDefault } from './videos.default';

export { articleListDefault } from './articleList.default';
export { blankPageDefault } from './blankPage.default';
export { bottomMenuDefault } from './bottomMenu.default';
export { combinationDefault } from './combination.default';
export { couponDefault } from './coupon.default';
export { customComponentDefault } from './customComponent.default';
export { customerServiceDefault } from './customerService.default';
export { followDefault } from './follow.default';
export { goodListDefault } from './goodList.default';
export { goodRecommendDefault } from './goodRecommend.default';
export { guideDefault } from './guide.default';
export { headerSerchDefault } from './headerSerch.default';
export { homeCombDefault } from './homeComb.default';
export { hotspotDefault } from './hotspot.default';
export { memberDefault } from './member.default';
export { menusDefault } from './menus.default';
export { newsDefault } from './news.default';
export { pageFootDefault } from './pageFoot.default';
export { pictureCubeDefault } from './pictureCube.default';
export { productDescDefault } from './productDesc.default';
export { productInfoDefault } from './productInfo.default';
export { productServiceDefault } from './productService.default';
export { promotionListDefault } from './promotionList.default';
export { reviewsDefault } from './reviews.default';
export { richTextDefault } from './richText.default';
export { swiperBgDefault } from './swiperBg.default';
export { tabNavDefault } from './tabNav.default';
export { titlesDefault } from './titles.default';
export { userInforDefault } from './userInfor.default';
export { videosDefault } from './videos.default';

export const diyComponentDefaults = {
  articleList: articleListDefault,
  blankPage: blankPageDefault,
  bottomMenu: bottomMenuDefault,
  combination: combinationDefault,
  coupon: couponDefault,
  customComponent: customComponentDefault,
  customerService: customerServiceDefault,
  follow: followDefault,
  goodList: goodListDefault,
  goodRecommend: goodRecommendDefault,
  guide: guideDefault,
  headerSerch: headerSerchDefault,
  homeComb: homeCombDefault,
  hotspot: hotspotDefault,
  member: memberDefault,
  menus: menusDefault,
  news: newsDefault,
  pageFoot: pageFootDefault,
  pictureCube: pictureCubeDefault,
  productDesc: productDescDefault,
  productInfo: productInfoDefault,
  productService: productServiceDefault,
  promotionList: promotionListDefault,
  reviews: reviewsDefault,
  richText: richTextDefault,
  swiperBg: swiperBgDefault,
  tabNav: tabNavDefault,
  titles: titlesDefault,
  userInfor: userInforDefault,
  videos: videosDefault,
} as const;

export type DiyComponentWithDefault = keyof typeof diyComponentDefaults;
