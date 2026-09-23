import { create } from 'zustand';
import type { TabBarTheme } from '@/platform';

/**
 * The little client state the shell shares across pages: the cart badge and the tab-bar
 * theme. Server data stays in TanStack Query; this holds only what the tab bar shows.
 */
interface ShellState {
  cartCount: number;
  tabBarTheme: TabBarTheme;
  setCartCount: (count: number) => void;
  setTabBarTheme: (theme: TabBarTheme) => void;
}

export const DEFAULT_TAB_BAR_THEME: TabBarTheme = {
  color: '#666666',
  selectedColor: '#e93323',
  backgroundColor: '#ffffff',
  borderStyle: 'white',
};

export const useShellStore = create<ShellState>()((set) => ({
  cartCount: 0,
  tabBarTheme: DEFAULT_TAB_BAR_THEME,
  setCartCount: (cartCount) => set({ cartCount }),
  setTabBarTheme: (tabBarTheme) => set({ tabBarTheme }),
}));
