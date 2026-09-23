import { renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createStubAssetSource } from '@/test/asset-source';
import { renderAdmin } from '@/test/render';

import { AssetPicker } from './asset-picker';
import { AssetSourceProvider, useAssetSource } from './asset-source-context';
import type { AssetSource } from './types';

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
});
