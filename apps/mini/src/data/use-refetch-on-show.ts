import { useRef } from 'react';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useDidShow } from '@tarojs/taro';

export interface RefetchOnShowOptions {
  /**
   * Refetch on every show, fresh or not. For a read the server changes behind the app's back
   * and that is cheap to ask again: 我的's own counts move with every payment, receipt, refund,
   * review or claim, wherever it happened.
   */
  always?: boolean | undefined;
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
  const always = options.always === true;
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    void client.refetchQueries({ queryKey, type: 'active', ...(always ? {} : { stale: true }) });
  });
}
