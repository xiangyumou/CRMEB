import removed from '../../../../crmeb/config/core_store_removed_admin.json';
import removedPages from '../../../../crmeb/config/core_store_removed_pages.json';

export function isRemovedAdminPath(path) {
  if (typeof path !== 'string') return false;
  const normalized = '/' + path.replace(/^\/+/, '').split('?')[0];
  const relative = normalized.replace(/^\/admin(?=\/)/, '');
  return removed.menuPaths.some((entry) => relative === entry || relative.startsWith(entry + '/'));
}

export function filterRemovedAdminRoutes(routes, parent = '') {
  return routes.reduce((result, route) => {
    const path = route.path.startsWith('/') ? route.path : `${parent}/${route.path}`;
    const children = route.children ? filterRemovedAdminRoutes(route.children, path) : null;
    if (isRemovedAdminPath(path) && (!children || !children.length)) return result;
    result.push(children ? { ...route, children } : route);
    return result;
  }, []);
}

export function filterRemovedAdminMenus(menus) {
  if (!Array.isArray(menus)) return [];
  return menus.reduce((result, menu) => {
    const children = menu.children ? filterRemovedAdminMenus(menu.children) : null;
    const retainedChild = children && children.find((child) => {
      const path = child.path || child.menu_path;
      return path && path !== '/' && path !== '/admin/' && !isRemovedAdminPath(path);
    });
    if (isRemovedAdminPath(menu.path || menu.menu_path) && !retainedChild) return result;
    const item = children ? { ...menu, children } : menu;
    if (retainedChild && isRemovedAdminPath(menu.path || menu.menu_path)) {
      if (item.path) item.path = retainedChild.path;
      if (item.menu_path) item.menu_path = retainedChild.menu_path;
    }
    result.push(item);
    return result;
  }, []);
}

export function isRemovedStoreLink(type, url) {
  if (removed.removedLinkTypes.includes(type)) return true;
  if (typeof url !== 'string') return false;
  const path = url.split('?')[0];
  return removedPages.includes(path.replace(/^\//, '')) ||
    removed.removedLinkPaths.some((entry) => path === entry || path.startsWith(entry + '/'));
}

export function filterStoreLinkCategories(categories) {
  return categories.reduce((result, category) => {
    const children = category.children ? filterStoreLinkCategories(category.children) : null;
    if ((removed.removedLinkCategoryNames.includes(category.name) || isRemovedStoreLink(category.type, category.url)) && (!children || !children.length)) return result;
    result.push(children ? { ...category, children } : category);
    return result;
  }, []);
}
