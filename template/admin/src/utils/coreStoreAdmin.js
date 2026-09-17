// Storefront links that point at removed pages are filtered out of the DIY editor.
import removedPages from '../../../../crmeb/config/core_store_removed_pages.json';

const removedLinkTypes = ["seckill", "bargain", "integral", "lottery_list"];
const removedLinkCategoryNames = ["秒杀链接", "砍价链接", "积分链接", "抽奖链接"];
const removedLinkPaths = ["/kefu", "/pages/activity/goods_seckill_details", "/pages/activity/goods_bargain_details", "/pages/points_mall", "/pages/goods/lottery"];

export function isRemovedStoreLink(type, url) {
  if (removedLinkTypes.includes(type)) return true;
  if (typeof url !== 'string') return false;
  const path = url.split('?')[0];
  return removedPages.includes(path.replace(/^\//, '')) ||
    removedLinkPaths.some((entry) => path === entry || path.startsWith(entry + '/'));
}

export function filterStoreLinkCategories(categories) {
  return categories.reduce((result, category) => {
    const children = category.children ? filterStoreLinkCategories(category.children) : null;
    if ((removedLinkCategoryNames.includes(category.name) || isRemovedStoreLink(category.type, category.url)) && (!children || !children.length)) return result;
    result.push(children ? { ...category, children } : category);
    return result;
  }, []);
}
