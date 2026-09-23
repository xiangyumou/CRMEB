'use client';

import { createContext, use, useMemo, type ReactNode } from 'react';

import type { AssetSource } from './types';

const AssetSourceContext = createContext<AssetSource | null>(null);

/**
 * The material library, from the nearest `<AssetSourceProvider>`.
 *
 * There is deliberately no fallback: a picker rendered without a provider
 * throws rather than offering files that are not in the library, because
 * whatever the operator picks is saved into a record and served to shoppers.
 * The admin shell mounts `StorageAssetSourceProvider`; tests mount
 * `createStubAssetSource()` from `@/test/asset-source`.
 */
export function useAssetSource(): AssetSource {
  const provided = use(AssetSourceContext);
  if (!provided) throw new Error('useAssetSource() needs an <AssetSourceProvider> above it');
  return provided;
}

export function AssetSourceProvider({
  source,
  children,
}: {
  source: AssetSource;
  children: ReactNode;
}) {
  const value = useMemo(() => source, [source]);
  return <AssetSourceContext value={value}>{children}</AssetSourceContext>;
}
