import { fireEvent, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createStubAssetSource } from '@/test/asset-source';
import { renderAdmin } from '@/test/render';

import { AssetPicker, selectRange } from './asset-picker';
import { AssetSourceProvider, useAssetSource } from './asset-source-context';
import type { AssetItem, AssetSource } from './types';

/**
 * `<AssetPicker>` reads its files from the mounted `AssetSource` and from
 * nothing else. What the operator picks is saved into a record and served to
 * shoppers, so a picker with no source must fail loudly instead of offering
 * files that are not in the library.
 */

describe('AssetPicker', () => {
  it('refuses to render without a mounted asset source', () => {
    expect(() => renderHook(() => useAssetSource())).toThrow(/AssetSourceProvider/);
  });

  it('lists the mounted source’s files', async () => {
    const stub = createStubAssetSource(3);
    const source: AssetSource = { ...stub, listAssets: vi.fn(stub.listAssets) };
    renderAdmin(
      <AssetSourceProvider source={source}>
        <AssetPicker open onClose={() => {}} onSelect={() => {}} />
      </AssetSourceProvider>,
    );

    expect(await screen.findByAltText('示例素材-1.png')).toBeInTheDocument();
    expect(source.listAssets).toHaveBeenCalled();
  });

  it('Shift+click picks the run from the last clicked tile, numbered in sweep order', async () => {
    const onSelect = vi.fn();
    renderAdmin(
      <AssetSourceProvider source={createStubAssetSource(8)}>
        <AssetPicker open multiple onClose={() => {}} onSelect={onSelect} />
      </AssetSourceProvider>,
    );

    fireEvent.click(await screen.findByTestId('asset-5'));
    fireEvent.click(screen.getByTestId('asset-2'), { shiftKey: true });

    expect(screen.getByTestId('asset-5')).toHaveTextContent('1');
    expect(screen.getByTestId('asset-4')).toHaveTextContent('2');
    expect(screen.getByTestId('asset-2')).toHaveTextContent('4');
    expect(screen.getByTestId('asset-1')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /确\s*定/ }));
    expect(onSelect.mock.calls[0]?.[0].map((asset: AssetItem) => asset.id)).toEqual([
      '5',
      '4',
      '3',
      '2',
    ]);
  });
});

describe('selectRange', () => {
  const items: AssetItem[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    id,
    url: '',
    name: id,
    mime: 'image/png',
    size: 1,
  }));
  const ids = (list: AssetItem[]) => list.map((item) => item.id);

  it('keeps what is already picked and appends the rest of the run', () => {
    const { next } = selectRange([items[2]!], items, 'a', 3, undefined);
    expect(ids(next)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('picks only the clicked tile when the anchor is not on this page', () => {
    expect(ids(selectRange([], items, 'zz', 2, undefined).next)).toEqual(['c']);
    expect(ids(selectRange([], items, null, 2, undefined).next)).toEqual(['c']);
  });

  it('stops at max and says so', () => {
    const result = selectRange([], items, 'a', 4, 3);
    expect(ids(result.next)).toEqual(['a', 'b', 'c']);
    expect(result.capped).toBe(true);
  });
});
