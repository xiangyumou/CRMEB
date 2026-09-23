import {
  QueryClient,
  environmentManager,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { onAppVisibility, onNetworkReachability } from '@/platform';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A mini-program page stays mounted under the ones pushed on top of it; a short
        // staleTime keeps "back" from refetching everything while still refreshing on return.
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
}

/**
 * Wires TanStack Query's focus and online managers to the mini-program instead of the DOM
 * (`visibilitychange` and `online`/`offline` do not exist there):
 *
 * - focus  = the app is in the foreground (`onAppShow` / `onAppHide`);
 * - online = `onNetworkStatusChange`, seeded with `getNetworkType`;
 * - never "server": Query decides that from `typeof window`, which in a mini-program is only
 *   defined because Taro's webpack config provides a fake `window`. A server-mode client
 *   disables refetch timers, retries and garbage collection, so it is pinned here.
 *
 * Coming back to a page inside a running app is not a focus change; `useRefetchOnShow`
 * covers that per page. Returns an uninstall function (tests).
 */
export function installQueryAdapters(): () => void {
  environmentManager.setIsServer(() => false);
  let stopFocus: (() => void) | undefined;
  let stopOnline: (() => void) | undefined;
  focusManager.setEventListener((setFocused) => {
    stopFocus = onAppVisibility((visible) => setFocused(visible));
    return () => stopFocus?.();
  });
  onlineManager.setEventListener((setOnline) => {
    stopOnline = onNetworkReachability(setOnline);
    return () => stopOnline?.();
  });
  return () => {
    stopFocus?.();
    stopOnline?.();
    focusManager.setEventListener(() => undefined);
    onlineManager.setEventListener(() => undefined);
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  };
}
