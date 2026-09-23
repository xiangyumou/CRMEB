import { describe, expect, it } from 'vitest';
import { taroFake } from '@/test/taro-fake/taro';
import { openPage } from './navigation';

describe('openPage', () => {
  it('navigates to a shipped page', async () => {
    await expect(openPage('pages/category/index')).resolves.toBe(true);
    expect(taroFake.calls).toContainEqual({
      api: 'navigateTo',
      args: { url: '/pages/category/index' },
    });
  });

  it('drops a link to a retired page (saved in an old DIY design)', async () => {
    await expect(openPage('/pages/points_mall/index?id=1')).resolves.toBe(false);
    expect(taroFake.calls.some((call) => call.api === 'navigateTo')).toBe(false);
  });
});
