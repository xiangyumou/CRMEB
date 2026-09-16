// The admin editor discovers preview components through require.context.
// These are their persisted client names, not the home_*.vue filenames.
export const retainedDiyNames = [
  'userInfor',
  'member',
  'articleList',
  'blankPage',
  'newVip',
  'combination',
  'coupon',
  'customerService',
  'goodList',
  'goodRecommend',
  'guide',
  'menus',
  'news',
  'pictureCube',
  'promotionList',
  'swiperBg',
  'swipers',
  'titles',
  'presale',
  'richText',
  'videos',
  'hotspot',
  'follow',
  'productInfo',
  'productService',
  'reviews',
  'productDesc',
  'customComponent',
  'pageFoot',
  'bottomMenu',
  'homeComb',
  'headerSerch',
  'tabNav',
];

export function supportsDiyComponent(name) {
  return retainedDiyNames.includes(name);
}
