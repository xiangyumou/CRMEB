'use client';

import { createContext, use, useMemo, type ReactNode } from 'react';

import { createStubAssetSource } from './stub-source';
import type { AssetSource } from './types';

const AssetSourceContext = createContext<AssetSource | null>(null);

let fallback: AssetSource | null = null;

/**
 * The material library the kit talks to. Defaults to the in-memory stub so the
 * picker works before stream F1 lands; wrap the shell in
 * `<AssetSourceProvider source={realSource}>` to swap it.
 */
export function useAssetSource(): AssetSource {
  const provided = use(AssetSourceContext);
  if (provided) return provided;
  fallback ??= createStubAssetSource();
  return fallback;
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
