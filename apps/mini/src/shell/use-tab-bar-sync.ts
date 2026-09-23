import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDidHide, useDidShow } from '@tarojs/taro';
import { cartCountQuery } from '@/data/cart';
import { useRefetchOnShow } from '@/data/use-refetch-on-show';
import { useShellStore } from '@/data/shell-store';
import { applyCartBadge, applyTabBarTheme } from '@/platform';

/**
 * Keeps the native tab bar in step with the shell store. Every tab page calls it.
 *
 * The native tab bar keeps its own selected state, so there is nothing to sync there (the
 * custom-tab-bar pitfall). What must be re-applied is what can change while the shopper is on
 * a non-tab page, where WeChat refuses tab-bar calls: the cart badge and the theme.
 */
export function useTabBarSync(): void {
  const { data } = useQuery(cartCountQuery);
  useRefetchOnShow(cartCountQuery.queryKey);
  const cartCount = useShellStore((state) => state.cartCount);
  const theme = useShellStore((state) => state.tabBarTheme);
  const setCartCount = useShellStore((state) => state.setCartCount);
  const shown = useRef(false);

  useEffect(() => {
    if (data) setCartCount(data.items);
  }, [data, setCartCount]);

  useDidShow(() => {
    shown.current = true;
    void applyTabBarTheme(theme);
    void applyCartBadge(cartCount);
  });
  useDidHide(() => {
    shown.current = false;
  });

  useEffect(() => {
    if (shown.current) void applyCartBadge(cartCount);
  }, [cartCount]);
  useEffect(() => {
    if (shown.current) void applyTabBarTheme(theme);
  }, [theme]);
}
