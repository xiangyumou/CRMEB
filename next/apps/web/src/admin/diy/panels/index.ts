import { createDiyPanelRegistry, type AnyDiyPanelDefinition } from '../panel-api';
import articleListPanel from './articleList.panel';
import combinationPanel from './combination.panel';
import blankPagePanel from './blankPage.panel';
import bottomMenuPanel from './bottomMenu.panel';
import couponPanel from './coupon.panel';
import customComponentPanel from './customComponent.panel';
import customerServicePanel from './customerService.panel';
import followPanel from './follow.panel';
import goodListPanel from './goodList.panel';
import goodRecommendPanel from './goodRecommend.panel';
import guidePanel from './guide.panel';
import headerSerchPanel from './headerSerch.panel';
import homeCombPanel from './homeComb.panel';
import hotspotPanel from './hotspot.panel';
import memberPanel from './member.panel';
import menusPanel from './menus.panel';
import newsPanel from './news.panel';
import pageFootPanel from './pageFoot.panel';
import pictureCubePanel from './pictureCube.panel';
import productDescPanel from './productDesc.panel';
import productInfoPanel from './productInfo.panel';
import productServicePanel from './productService.panel';
import promotionListPanel from './promotionList.panel';
import reviewsPanel from './reviews.panel';
import richTextPanel from './richText.panel';
import swiperBgPanel from './swiperBg.panel';
import tabNavPanel from './tabNav.panel';
import titlesPanel from './titles.panel';
import userInforPanel from './userInfor.panel';
import videosPanel from './videos.panel';

/**
 * Every config panel the editor knows, in `DIY_COMPONENT_KEYS` (palette) order.
 *
 * **Owned by stream G2 from here on.** Adding a panel is two lines — an import
 * and a row in the array — and nothing else in the editor changes. A component
 * key with no panel is not broken: `<DiyPanelHost>` falls back to the raw JSON
 * editor, which is also what the three render-only keys (`newVip`, `presale`,
 * `swipers`) get, since they have no editor UI in the old admin either.
 */
export const diyPanels: readonly AnyDiyPanelDefinition[] = [
  articleListPanel,
  combinationPanel,
  couponPanel,
  goodListPanel,
  menusPanel,
  newsPanel,
  swiperBgPanel,
  titlesPanel,
  hotspotPanel,
  pageFootPanel,
  homeCombPanel,
  headerSerchPanel,
  customComponentPanel,
  customerServicePanel,
  tabNavPanel,
  blankPagePanel,
  followPanel,
  guidePanel,
  richTextPanel,
  videosPanel,
  goodRecommendPanel,
  productDescPanel,
  productInfoPanel,
  productServicePanel,
  reviewsPanel,
  bottomMenuPanel,
  pictureCubePanel,
  promotionListPanel,
  userInforPanel,
  memberPanel,
];

export const diyPanelRegistry = createDiyPanelRegistry(diyPanels);
