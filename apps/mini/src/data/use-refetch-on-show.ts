import { useRef } from 'react';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useDidShow } from '@tarojs/taro';

export interface RefetchOnShowOptions {
  /**
   * Which of the page's cached reads to fetch again when it is shown:
   *
   * - `stale` (default): past their staleTime or invalidated;
   * - `always`: every time, for a read the server changes behind the app's back that is cheap
   *   to ask again (我的's counts move with every payment, receipt, refund, review or claim);
   * - `invalidated`: only a read a change marked stale (`markStale`), for a heavy page that
   *   should not be fetched again merely because 30 s went by (a decorated 首页).
   */
  when?: 'stale' | 'always' | 'invalidated' | undefined;
}

/**
 * Refetches this page's stale queries when the page is shown again (back navigation, tab
 * switch). The first show is the mount, where `useQuery` already fetches.
 *
 * Scoped by key on purpose: pages lower in the stack keep their observers, so refetching
 * every active query on each show would refetch hidden pages too.
 */
export function useRefetchOnShow(queryKey: QueryKey, options: RefetchOnShowOptions = {}): void {
  const client = useQueryClient();
  const firstShow = useRef(true);
  const when = options.when ?? 'stale';
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    void client.refetchQueries({
      queryKey,
      type: 'active',
      ...(when === 'stale' ? { stale: true } : {}),
      ...(when === 'invalidated' ? { predicate: (query) => query.state.isInvalidated } : {}),
    });
  });
}
