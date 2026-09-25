import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderAdmin, zhName } from '@/test/render';

import { FilterBar } from './filter-bar';

describe('<FilterBar>', () => {
  it('sends an amount as a money string and a search without its stray spaces', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderAdmin(
      <FilterBar
        filters={[
          { kind: 'text', name: 'keyword', label: '名称' },
          { kind: 'money', name: 'priceFrom', label: '价格从' },
        ]}
        values={{}}
        onApply={onApply}
      />,
    );

    await user.type(screen.getByTestId('filter-keyword'), '  T 恤 ');
    await user.type(screen.getByPlaceholderText('0.00'), '100');
    await user.click(screen.getByRole('button', { name: zhName('查询') }));

    // The contract's money is "100.00": "100" was a 422 on every search.
    expect(onApply).toHaveBeenLastCalledWith({ keyword: 'T 恤', priceFrom: '100.00' });
  });

  it('drops a search that is only spaces', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderAdmin(
      <FilterBar
        filters={[{ kind: 'text', name: 'keyword', label: '名称' }]}
        values={{}}
        onApply={onApply}
      />,
    );

    await user.type(screen.getByTestId('filter-keyword'), '   ');
    await user.click(screen.getByRole('button', { name: zhName('查询') }));

    expect(onApply).toHaveBeenLastCalledWith({ keyword: undefined });
  });
});
