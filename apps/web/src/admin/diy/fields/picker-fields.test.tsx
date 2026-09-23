import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { createStubDiyDataSource } from '@/test/diy-data-source';
import { renderAdmin, zhName } from '@/test/render';

import { DiyDataSourceProvider, type DiyDataSource } from '../data-source';
import { DiyRecordPickerField, type DiyRecordPickerFieldProps } from './picker-fields';

/**
 * The record picker over a saved page.
 *
 * The server keeps 商品列表's picks as `goodsList.ids` and drops the rows, so
 * the editor opens such a page with ids and no `list`. These tests pin down
 * that the field shows those picks, in their order, and that every edit keeps
 * the ones it did not touch.
 */

type Config = NonNullable<DiyRecordPickerFieldProps['value']>;

function renderField(initial: Config, source: DiyDataSource = createStubDiyDataSource()) {
  const seen: Config[] = [];
  function Harness() {
    const [value, setValue] = useState<Config>(initial);
    return (
      <DiyRecordPickerField
        kind="product"
        value={value}
        onChange={(next) => {
          seen.push(next);
          setValue(next);
        }}
      />
    );
  }
  renderAdmin(
    <DiyDataSourceProvider source={source}>
      <Harness />
    </DiyDataSourceProvider>,
  );
  return { seen, last: () => seen[seen.length - 1] };
}

async function picked(): Promise<string[]> {
  const chips = await screen.findAllByTestId('diy-picked');
  return chips.map((chip) => chip.textContent ?? '');
}

const addButton = () => screen.getByRole('button', { name: zhName('添加') });

describe('<DiyRecordPickerField> over stored ids', () => {
  it('shows the saved picks in their saved order, and says how many are gone', async () => {
    renderField({ max: 20, ids: [3, 999, 1] });

    expect(await picked()).toEqual(['示例商品 3', '示例商品 1']);
    expect(screen.getByText('有 1 项已不存在，不再展示')).toBeInTheDocument();
  });

  it('adds a pick after the saved ones, keeping their ids as stored', async () => {
    const user = userEvent.setup();
    const { last } = renderField({ max: 20, ids: [3, 1] });
    await picked();

    await user.click(addButton());
    const modal = await screen.findByRole('dialog', { name: '选择商品' });
    const row = (await within(modal).findAllByRole('listitem')).find((item) =>
      item.textContent?.includes('示例商品 5'),
    );
    await user.click(within(row!).getByRole('button', { name: zhName('选择') }));

    // `ids` goes: the server derives it from `list` again on save.
    expect(last()).toEqual({
      max: 20,
      list: [
        { id: 3, name: '示例商品 3', image: '' },
        { id: 1, name: '示例商品 1', image: '' },
        { id: '5', name: '示例商品 5', image: '' },
      ],
    });
  });

  it('reorders and removes without losing the others', async () => {
    const user = userEvent.setup();
    const { last } = renderField({ max: 20, ids: [3, 1, 2] });
    await picked();

    const [first] = await screen.findAllByTestId('diy-picked');
    await user.click(within(first!).getByRole('button', { name: '后移' }));
    expect(await picked()).toEqual(['示例商品 1', '示例商品 3', '示例商品 2']);

    const [, , third] = await screen.findAllByTestId('diy-picked');
    await user.click(within(third!).getByRole('button', { name: '移除' }));
    expect(last()?.list).toEqual([
      { id: 1, name: '示例商品 1', image: '' },
      { id: 3, name: '示例商品 3', image: '' },
    ]);
  });

  it('prefers a non-empty list to ids, as the storefront does', async () => {
    renderField({ list: [{ id: 7, name: '列表里的商品' }], ids: [3] });
    expect(await picked()).toEqual(['列表里的商品']);
  });

  it('stays read-only until the ids resolve, and when they cannot', async () => {
    const stub = createStubDiyDataSource();
    let fail: (error: Error) => void = () => {};
    const source: DiyDataSource = {
      ...stub,
      resolve: () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    };
    const { seen } = renderField({ max: 20, ids: [3, 1] }, source);

    // Adding now would replace picks the field has not shown yet.
    expect(addButton()).toBeDisabled();

    fail(new Error('网络错误'));
    expect(await screen.findByText('已选商品加载失败')).toBeInTheDocument();
    expect(addButton()).toBeDisabled();
    expect(seen).toEqual([]);
  });

  it('recovers through 重试', async () => {
    const user = userEvent.setup();
    const stub = createStubDiyDataSource();
    let calls = 0;
    const source: DiyDataSource = {
      ...stub,
      resolve: (kind, ids) => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('网络错误')) : stub.resolve(kind, ids);
      },
    };
    renderField({ max: 20, ids: [2] }, source);

    await user.click(await screen.findByRole('button', { name: zhName('重试') }));
    expect(await picked()).toEqual(['示例商品 2']);
    await waitFor(() => expect(addButton()).toBeEnabled());
  });
});
