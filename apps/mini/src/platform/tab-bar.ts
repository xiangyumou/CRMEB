import Taro from '@tarojs/taro';
import { tabIndex } from './tab-pages';

export interface TabBarTheme {
  color: string;
  selectedColor: string;
  backgroundColor: string;
  borderStyle: 'black' | 'white';
}

/**
 * Native tab bar, themed at runtime. The calls fail when the current page is not a tab page
 * (WeChat answers `setTabBarStyle:fail not TabBar page`), so they are made from a tab page's
 * `useDidShow` and a failure is ignored rather than surfaced.
 */
export async function applyTabBarTheme(theme: TabBarTheme): Promise<void> {
  await Taro.setTabBarStyle(theme).catch(() => undefined);
}

/** The cart tab's badge: a count, capped at 99+, or nothing for zero. */
export async function applyCartBadge(count: number): Promise<void> {
  const index = tabIndex('cart');
  if (count > 0) {
    const text = count > 99 ? '99+' : String(count);
    await Taro.setTabBarBadge({ index, text }).catch(() => undefined);
  } else {
    await Taro.removeTabBarBadge({ index }).catch(() => undefined);
  }
}
