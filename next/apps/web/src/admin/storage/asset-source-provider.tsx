'use client';

import { useState, type ReactNode } from 'react';

import { AssetSourceProvider } from '../kit/asset/asset-source-context';
import { createStorageAssetSource } from './asset-source';

/**
 * Installs the real material library for everything inside the admin shell.
 *
 * Without this the kit falls back to `createStubAssetSource()`, which is an
 * in-memory library that looks convincing and loses everything on reload — so
 * this provider is the difference between the picker working and the picker
 * appearing to work.
 *
 * One instance per browser tab (`useState`), so the source is stable across
 * re-renders and no request is made until a picker actually opens.
 */
export function StorageAssetSourceProvider({ children }: { children: ReactNode }) {
  const [source] = useState(createStorageAssetSource);
  return <AssetSourceProvider source={source}>{children}</AssetSourceProvider>;
}
