import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  userLabelCategoryList,
  userLabelCategoryUpdate,
  userLabelList,
} from '@shop/contracts/user/user.taxonomy.contract';
import { userLabelCategoryExample, userLabelExample } from '@shop/contracts/user/schemas';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes } from '@/test/api';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { UserLabelsPage } from './labels';

afterEach(() => {
  resetApiConfig();
});

describe('用户标签', () => {
  it('renaming a 标签分类 refreshes the labels that show its name', async () => {
    let name = userLabelCategoryExample.name;
    const calls = stubRoutes([
      on(userLabelCategoryList, () => ({
        items: [{ ...userLabelCategoryExample, name }],
        total: 1,
        page: 1,
        pageSize: 100,
      })),
      on(userLabelList, () => ({
        items: [{ ...userLabelExample, categoryName: name }],
        total: 1,
        page: 1,
        pageSize: 20,
      })),
      on(userLabelCategoryUpdate, () => {
        name = '购物偏好';
        return { ...userLabelCategoryExample, name };
      }),
    ]);
    renderAdmin(<UserLabelsPage />, {
      identity: { ...testIdentity, permissions: ['user:label:read', 'user:label:write'] },
    });
    await screen.findByText('母婴');

    await userEvent.click(screen.getByRole('tab', { name: '标签分类' }));
    const panel = screen.getByRole('tabpanel', { name: '标签分类' });
    await userEvent.click(await within(panel).findByRole('button', { name: zhName('编辑') }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('名称');
    await userEvent.clear(input);
    await userEvent.type(input, '购物偏好');
    const before = calls.filter((call) => call.url.includes('/admin-api/user-labels?')).length;
    await userEvent.click(within(dialog).getByRole('button', { name: zhName('保存') }));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.url.includes('/admin-api/user-labels?')).length,
      ).toBeGreaterThan(before);
    });
  });
});
