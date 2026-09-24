import { useRef } from 'react';
import {
  type InfiniteData,
  type Query,
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from '@tanstack/react-query';
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
  /**
   * For a page-by-page list (`useInfiniteRouteQuery`) that has only aged past its staleTime:
   *
   * - `all` (default): TanStack's refetch, every loaded page again, one after another;
   * - `first`: page 1 only, put in place of the cached page 1 (`refetchFirstPage`). A list a
   *   change marked stale (`invalidated`) is still fetched in full: the changed row may be on
   *   any page.
   */
  pages?: 'all' | 'first' | undefined;
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
  const pages = options.pages ?? 'all';
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false;
      return;
    }
    if (pages === 'first' && when === 'stale') {
      for (const query of client
        .getQueryCache()
        .findAll({ queryKey, type: 'active', stale: true })) {
        void refetchFirstPage(client, query).catch(() => undefined);
      }
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

/**
 * Fetches page 1 of a page-by-page list again and puts it in place of the cached page 1,
 * keeping the pages after it as they were. TanStack's own refetch of an infinite query asks
 * for every loaded page one after another, so coming back to a list scrolled ten pages deep
 * cost ten requests; this costs one, and the list keeps its length and the shopper's place.
 *
 * Pages after the first are as fresh as when they were loaded (下拉刷新 fetches them all). An
 * item that moved across the page boundary meanwhile can be in page 1 and page 2 at once;
 * `InfiniteList` shows it once.
 *
 * A list already fetching is left to that fetch. A list with one page (or none), a list a
 * change marked stale and a query that is not a paged list get the ordinary refetch. If
 * something else fetched the list while page 1 was on its way, the newer copy wins and page 1
 * is dropped.
 */
export async function refetchFirstPage(client: QueryClient, query: Query): Promise<void> {
  // Already on its way (a pull-down, the next page, a change's refetch).
  if (query.state.fetchStatus !== 'idle') return;
  const data = query.state.data as InfiniteData<unknown> | undefined;
  const queryFn = query.options.queryFn;
  const paged = !!data && Array.isArray(data.pages) && Array.isArray(data.pageParams);
  if (
    !paged ||
    data.pages.length <= 1 ||
    typeof queryFn !== 'function' ||
    query.state.isInvalidated
  ) {
    await client.refetchQueries({ queryKey: query.queryKey, exact: true });
    return;
  }
  const before = query.state.dataUpdatedAt;
  const first: unknown = await queryFn({
    client,
    queryKey: query.queryKey,
    signal: new AbortController().signal,
    meta: query.meta,
    pageParam: data.pageParams[0],
    direction: 'forward',
  });
  if (query.state.dataUpdatedAt !== before || query.state.fetchStatus !== 'idle') return;
  client.setQueryData<InfiniteData<unknown>>(query.queryKey, (old) =>
    old && old.pages.length > 0 ? { ...old, pages: [first, ...old.pages.slice(1)] } : old,
  );
}
