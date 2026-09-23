import { create } from 'zustand';
import type { AppAppearance } from '@shop/contracts/system/app.schemas';
import { DEFAULT_PRIMARY, deriveTheme, themeStyle, type DerivedTheme } from './derive';

/**
 * The shop's theme as the pages use it: derived tokens, the page-style string `PageShell`
 * writes on every page, and the native tab bar's look (docs/mini/design.md §3.1).
 *
 * Fed from `app/config` (cached first, then fresh; src/app-config). Until then it holds the
 * design defaults, which equal `app.scss`, so a page rendered before the config arrives looks
 * the same as one without a theme.
 */
export interface TabBarLook {
  color: string;
  selectedColor: string;
  backgroundColor: string;
  items: ReadonlyArray<{
    key: 'home' | 'category' | 'cart' | 'me';
    label: string;
    iconUrl: string | null;
    selectedIconUrl: string | null;
  }>;
}

interface ThemeState {
  theme: DerivedTheme;
  /** `--color-*` custom properties for page-meta `page-style`; `''` = the app.scss defaults. */
  style: string;
  tabBar: TabBarLook;
  /** A version per appearance applied, so the native tab bar re-applies only on change. */
  revision: number;
  applyAppearance: (appearance: AppAppearance) => void;
}

const DEFAULT_THEME = deriveTheme({ primary: DEFAULT_PRIMARY });

export const DEFAULT_TAB_BAR: TabBarLook = {
  color: '#666666',
  selectedColor: DEFAULT_THEME.primaryText,
  backgroundColor: '#FFFFFF',
  items: [
    { key: 'home', label: '首页', iconUrl: null, selectedIconUrl: null },
    { key: 'category', label: '分类', iconUrl: null, selectedIconUrl: null },
    { key: 'cart', label: '购物车', iconUrl: null, selectedIconUrl: null },
    { key: 'me', label: '我的', iconUrl: null, selectedIconUrl: null },
  ],
};

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: DEFAULT_THEME,
  style: '',
  tabBar: DEFAULT_TAB_BAR,
  revision: 0,
  applyAppearance: (appearance) => {
    const theme = deriveTheme({
      primary: appearance.theme.primaryColor,
      price: appearance.theme.priceColor,
    });
    const style = themeStyle(theme, appearance.theme.radius);
    const tabBar: TabBarLook = {
      color: appearance.tabBar.color,
      selectedColor: appearance.tabBar.selectedColor,
      backgroundColor: appearance.tabBar.backgroundColor,
      items: appearance.tabBar.items,
    };
    const current = get();
    if (style === current.style && JSON.stringify(tabBar) === JSON.stringify(current.tabBar))
      return;
    set({ theme, style, tabBar, revision: current.revision + 1 });
  },
}));

/** The page-style string for the current theme. */
export function useThemeStyle(): string {
  return useThemeStore((state) => state.style);
}
