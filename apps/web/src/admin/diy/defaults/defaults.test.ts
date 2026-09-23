import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { diyComponentDefaults } from './index';

/** Every page the storefront registers, as `/pages/...` paths. */
function storefrontPages(): Set<string> {
  const file = path.join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'uni-app',
    'pages.json',
  );
  // uni-app allows comments in `pages.json`; strip any before parsing.
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const json = JSON.parse(text) as {
    pages: Array<{ path: string }>;
    subPackages?: Array<{ root: string; pages: Array<{ path: string }> }>;
  };
  const out = new Set(json.pages.map((page) => `/${page.path}`));
  for (const pkg of json.subPackages ?? []) {
    for (const page of pkg.pages) out.add(`/${pkg.root.replace(/\/$/, '')}/${page.path}`);
  }
  return out;
}

/** Every `/pages/...` string in a value, without its query. */
function links(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('/pages/')) out.push(value.split('?')[0]!);
  } else if (Array.isArray(value)) {
    for (const item of value) links(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) links(item, out);
  }
  return out;
}

describe('factory defaults', () => {
  it('link only to pages the storefront registers', () => {
    const pages = storefrontPages();
    expect(pages.has('/pages/index/index')).toBe(true);
    const missing = Object.entries(diyComponentDefaults).flatMap(([name, value]) =>
      links(value)
        .filter((link) => !pages.has(link))
        .map((link) => `${name}: ${link}`),
    );
    expect(missing).toEqual([]);
  });
});
