import type { ReactNode } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { testQueryClient } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import { useRefetchOnShow } from './use-refetch-on-show';

function setup(staleTime: number) {
  let fetches = 0;
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => {
      useRefetchOnShow(['greeting']);
      return useQuery({
        queryKey: ['greeting'],
        queryFn: async () => `hello ${++fetches}`,
        staleTime,
      });
    },
    { wrapper },
  );
  return { hook, fetches: () => fetches };
}

describe('useRefetchOnShow', () => {
  it('refetches a stale query when the page is shown again, not on the first show', async () => {
    const { hook, fetches } = setup(0);
    await waitFor(() => expect(hook.result.current.data).toBe('hello 1'));
    expect(fetches()).toBe(1);

    act(() => taroFake.showPage());
    await waitFor(() => expect(hook.result.current.data).toBe('hello 2'));
  });

  it('leaves a fresh query alone', async () => {
    const { hook, fetches } = setup(60_000);
    await waitFor(() => expect(hook.result.current.data).toBe('hello 1'));

    act(() => taroFake.showPage());
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetches()).toBe(1);
  });
});
