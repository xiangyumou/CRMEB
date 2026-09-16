export const diyComponentNames = [
  'userInfor', 'member', 'articleList', 'blankPage', 'newVip',
  'combination', 'coupon', 'customerService', 'goodList', 'goodRecommend',
  'guide', 'menus', 'news', 'pictureCube', 'promotionList', 'swiperBg',
  'swipers', 'titles', 'presale', 'richText', 'videos', 'hotspot',
  'follow', 'productInfo', 'productService', 'reviews', 'productDesc',
  'customComponent', 'pageFoot', 'homeComb', 'headerSerch', 'tabNav',
];

export function supportsDiyComponent(name) {
  return diyComponentNames.includes(name);
}
