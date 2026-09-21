import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactElement, ReactNode } from 'react';

import type { AdminIdentity } from '@/admin/api/contracts';
import { MockSessionProvider } from '@/admin/session/session-provider';

export const testIdentity: AdminIdentity = {
  id: '1',
  account: 'tester',
  name: '测试管理员',
  isSuper: false,
  permissions: ['demo:widget:list', 'demo:widget:create'],
};

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface AdminRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  identity?: AdminIdentity | null;
  queryClient?: QueryClient;
}

/** Renders a component inside the same providers the real admin gives it. */
export function renderAdmin(
  ui: ReactElement,
  {
    identity = testIdentity,
    queryClient = makeTestQueryClient(),
    ...options
  }: AdminRenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  function Wrapper({ children }: { children: ReactNode }) {
    const inner = identity ? (
      <MockSessionProvider identity={identity}>{children}</MockSessionProvider>
    ) : (
      children
    );
    return (
      <QueryClientProvider client={queryClient}>
        <ConfigProvider locale={zhCN} theme={{ cssVar: { prefix: 'ant' } }}>
          <App component={false}>{inner}</App>
        </ConfigProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}

/**
 * Matcher for a Chinese control label.
 *
 * antd inserts a space between the two characters of a two-CJK-character button
 * ("保存" renders as "保 存"), and an icon contributes its own `aria-label` to
 * the accessible name, so neither an exact string nor an anchored pattern
 * matches. This is a loose substring match that tolerates both.
 */
export function zhName(text: string): RegExp {
  return new RegExp(text.split('').join('\\s*'));
}
