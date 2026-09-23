import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithQuery } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import Home from './index';

describe('首页 (placeholder)', () => {
  it('shows the cart count and puts it on the cart tab', async () => {
    renderWithQuery(<Home />);
    expect(screen.getByText('购物车加载中')).toBeTruthy();

    await screen.findByText('购物车 3 件');
    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'setTabBarBadge',
        args: { index: 2, text: '3' },
      }),
    );
    expect(taroFake.calls.some((call) => call.api === 'setTabBarStyle')).toBe(true);
  });

  it('opens the demo sub-package page', async () => {
    renderWithQuery(<Home />);
    fireEvent.click(screen.getByRole('button', { name: '组件示例' }));
    await waitFor(() =>
      expect(taroFake.calls).toContainEqual({
        api: 'navigateTo',
        args: { url: '/subpackages/demo/pages/ui/index' },
      }),
    );
  });
});
