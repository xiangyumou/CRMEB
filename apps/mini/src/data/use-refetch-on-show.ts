import { useRef } from 'react';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useDidShow } from '@tarojs/taro';

/**
 * Refetches this page's stale queries when the page is shown again (back navigation, tab
 * switch). The first show is the mount, where `useQuery` already fetches.
 *
 * Scoped by key on purpose: pages lower in the stack keep their observers, so refetching
 * every active query on each show would refetch hidden pages too.
 */
export function useRefetchOnShow(queryKey: QueryKey): void {
  const client = useQueryClient();
  const firstShow = useRef(true);
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    void client.refetchQueries({ queryKey, type: 'active', stale: true });
  });
}
