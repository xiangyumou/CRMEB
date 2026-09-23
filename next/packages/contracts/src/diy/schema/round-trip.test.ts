import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  diyPageEntriesInOrder,
  parseDiyPageValue,
  reindexDiyPageValue,
  safeParseDiyPageValue,
  serialiseDiyPageValue,
  type DiyPageValue,
} from './page';
import {
  CREATABLE_COMPONENT_KEYS,
  DIY_COMPONENT_KEYS,
  diyComponentSchemas,
  isDiyComponentKey,
  RENDERABLE_COMPONENT_KEYS,
  RENDER_ONLY_COMPONENT_KEYS,
} from './registry';

const FIXTURES = path.join(import.meta.dirname, '..', '__fixtures__');

function read(name: string): string {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

const PROD = readdirSync(FIXTURES)
  .filter((f) => f.startsWith('prod-'))
  .sort();

describe('the fixture set', () => {
  it('holds the six production exports', () => {
    expect(PROD).toEqual([
      'prod-2.json',
      'prod-3.json',
      'prod-4.json',
      'prod-6.json',
      'prod-7.json',
      'prod-8.json',
    ]);
  });

  // The install SQL and the production export are the same six rows; the brief
  // lists them as two sources, so this pins that they have not diverged.
  it.each(PROD)('%s is stored exactly as JSON.stringify(x, null, 2)', (file) => {
    const raw = read(file);
    expect(JSON.stringify(JSON.parse(raw), null, 2)).toBe(raw);
  });
});

describe('page value round trip', () => {
  const pages: Array<[string, DiyPageValue, string]> = [];
  for (const file of PROD) {
    const row = JSON.parse(read(file)) as { value: unknown };
    if (row.value && typeof row.value === 'object') {
      pages.push([file, row.value as DiyPageValue, JSON.stringify(row.value, null, 2)]);
    }
  }
  for (const file of ['default-components.json', 'retired-components.json']) {
    pages.push([file, JSON.parse(read(file)) as DiyPageValue, read(file)]);
  }

  it('covers the three page exports plus the two synthetic ones', () => {
    expect(pages.map(([f]) => f)).toEqual([
      'prod-6.json',
      'prod-7.json',
      'prod-8.json',
      'default-components.json',
      'retired-components.json',
    ]);
  });

  it.each(pages)('%s: parse -> serialise is byte-identical', (_file, value, json) => {
    expect(serialiseDiyPageValue(parseDiyPageValue(value))).toBe(json);
  });

  it.each(pages)('%s: serialisation is idempotent', (_file, value) => {
    const once = serialiseDiyPageValue(parseDiyPageValue(value));
    const twice = serialiseDiyPageValue(parseDiyPageValue(JSON.parse(once) as DiyPageValue));
    expect(twice).toBe(once);
  });

  it.each(pages)('%s: parsing returns the caller’s own object', (_file, value) => {
    expect(parseDiyPageValue(value)).toBe(value);
  });

  it.each(pages)('%s: every node keeps its own key order', (_file, value) => {
    const parsed = parseDiyPageValue(value);
    for (const [key, node] of Object.entries(parsed)) {
      expect(Object.keys(node as object)).toEqual(
        Object.keys((value as Record<string, object>)[key]!),
      );
    }
  });
});

describe('moren.js defaults', () => {
  const moren = JSON.parse(read('moren-default-config.json')) as Record<
    string,
    Record<string, unknown>
  >;

  it('has the 18 legacy component blocks', () => {
    expect(Object.keys(moren)).toHaveLength(18);
  });

  // moren.js predates the visual editor: its keys are component names, and
  // seven of them (`activity`, `scrollBox`, `picTxt`, `tabBar`, …) are not in
  // the registry at all. They must still survive, which is the whole point of
  // the passthrough rule.
  it.each(Object.keys(JSON.parse(read('moren-default-config.json')) as object))(
    '%s survives a page round trip under both defaultVal and default',
    (key) => {
      const block = moren[key]!;
      for (const variant of ['defaultVal', 'default'] as const) {
        const payload = block[variant];
        if (payload === undefined) continue;
        const page = { '1': { name: key, timestamp: 1, ...(payload as object) } };
        const json = JSON.stringify(page, null, 2);
        expect(serialiseDiyPageValue(parseDiyPageValue(page))).toBe(json);
      }
    },
  );
});

describe('component schemas', () => {
  it('registers all 33 admin keys', () => {
    expect(DIY_COMPONENT_KEYS).toHaveLength(33);
  });

  it('matches the legacy admin palette, in order', () => {
    // template/admin/src/utils/diyRegistry.js:3-37
    expect(DIY_COMPONENT_KEYS).toEqual([
      'userInfor',
      'member',
      'articleList',
      'blankPage',
      'newVip',
      'combination',
      'coupon',
      'customerService',
      'goodList',
      'goodRecommend',
      'guide',
      'menus',
      'news',
      'pictureCube',
      'promotionList',
      'swiperBg',
      'swipers',
      'titles',
      'presale',
      'richText',
      'videos',
      'hotspot',
      'follow',
      'productInfo',
      'productService',
      'reviews',
      'productDesc',
      'customComponent',
      'pageFoot',
      'bottomMenu',
      'homeComb',
      'headerSerch',
      'tabNav',
    ]);
  });

  it('matches the uni renderer list, which omits bottomMenu', () => {
    // template/uni-app/utils/diyRegistry.js:1-8
    expect(RENDERABLE_COMPONENT_KEYS).toHaveLength(32);
    expect(RENDERABLE_COMPONENT_KEYS).not.toContain('bottomMenu');
  });

  it('keeps the three render-only keys out of the palette', () => {
    expect(CREATABLE_COMPONENT_KEYS).toHaveLength(27);
    for (const key of RENDER_ONLY_COMPONENT_KEYS) {
      expect(CREATABLE_COMPONENT_KEYS).not.toContain(key);
    }
    expect(CREATABLE_COMPONENT_KEYS).not.toContain('pageFoot');
    expect(CREATABLE_COMPONENT_KEYS).not.toContain('bottomMenu');
  });

  it('keeps customComponent renderable but out of the palette (CR-2-g2)', () => {
    // 超级组件's inner designer is not in this build, so an empty one could
    // never be filled; existing nodes still render, parse and round-trip.
    expect(CREATABLE_COMPONENT_KEYS).not.toContain('customComponent');
    expect(RENDERABLE_COMPONENT_KEYS).toContain('customComponent');
    expect(DIY_COMPONENT_KEYS).toContain('customComponent');
    expect(RENDER_ONLY_COMPONENT_KEYS).not.toContain('customComponent');
  });

  it.each(DIY_COMPONENT_KEYS)('%s pins its own name', (key) => {
    const schema = diyComponentSchemas[key];
    expect(schema.safeParse({ name: key }).success).toBe(true);
    expect(schema.safeParse({ name: 'somethingElse' }).success).toBe(false);
  });

  it.each(DIY_COMPONENT_KEYS)('%s keeps unknown keys', (key) => {
    const parsed = diyComponentSchemas[key].parse({
      name: key,
      aKeyFromTheFuture: { nested: [1, 2, 3] },
    });
    expect((parsed as Record<string, unknown>).aKeyFromTheFuture).toEqual({ nested: [1, 2, 3] });
  });

  it('validates each captured default against its own schema', () => {
    const page = JSON.parse(read('default-components.json')) as Record<string, { name: string }>;
    const failures: string[] = [];
    for (const node of Object.values(page)) {
      if (!isDiyComponentKey(node.name)) {
        failures.push(`${node.name}: not registered`);
        continue;
      }
      const result = diyComponentSchemas[node.name].safeParse(node);
      if (!result.success) {
        failures.push(`${node.name}: ${JSON.stringify(result.error.issues.slice(0, 3))}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('validates every node of every production page against its own schema', () => {
    const failures: string[] = [];
    for (const file of ['prod-6.json', 'prod-7.json', 'prod-8.json']) {
      const row = JSON.parse(read(file)) as { value: Record<string, { name?: string }> };
      for (const [key, node] of Object.entries(row.value)) {
        if (!node.name || !isDiyComponentKey(node.name)) continue;
        const result = diyComponentSchemas[node.name].safeParse(node);
        if (!result.success) {
          failures.push(`${file} ${key} ${node.name}: ${JSON.stringify(result.error.issues)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('render order', () => {
  it('sorts by timestamp, not by key', () => {
    // prod-7 stores its nodes in a key order that is not the render order.
    const row = JSON.parse(read('prod-7.json')) as { value: DiyPageValue };
    const keys = Object.keys(row.value);
    const ordered = diyPageEntriesInOrder(row.value).map((e) => e.key);
    expect(ordered).not.toEqual(keys);
    expect([...ordered].sort()).toEqual([...keys].sort());
  });

  it('puts a node with no usable timestamp last', () => {
    const value: DiyPageValue = {
      undefined: { name: 'pageFoot' },
      '2': { name: 'titles', timestamp: 2 },
      '1': { name: 'titles', timestamp: 1 },
    };
    expect(diyPageEntriesInOrder(value).map((e) => e.key)).toEqual(['1', '2', 'undefined']);
  });

  it('reindexes keys to timestamps while keeping render order', () => {
    const value: DiyPageValue = {
      a: { name: 'titles', timestamp: 20 },
      b: { name: 'titles', timestamp: 10 },
    };
    expect(Object.keys(reindexDiyPageValue(diyPageEntriesInOrder(value)))).toEqual(['10', '20']);
  });

  it('leaves a keyless node under its original key when reindexing', () => {
    const value: DiyPageValue = { undefined: { name: 'pageFoot' } };
    expect(Object.keys(reindexDiyPageValue(diyPageEntriesInOrder(value)))).toEqual(['undefined']);
  });
});

describe('rejections', () => {
  it('rejects a page that is not an object of objects', () => {
    expect(safeParseDiyPageValue({ a: 'not a node' }).ok).toBe(false);
    // zod's record rejects an array outright, which is what we want: an array
    // page would silently renumber on the next save.
    expect(safeParseDiyPageValue([]).ok).toBe(false);
    expect(safeParseDiyPageValue(null).ok).toBe(false);
  });

  it('accepts a node whose name we have never heard of', () => {
    expect(safeParseDiyPageValue({ '1': { name: 'someFutureThing', wat: 1 } }).ok).toBe(true);
  });

  it('reports where the problem is', () => {
    const result = safeParseDiyPageValue({ '1': { name: 'titles', isHide: 'yes' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.path).toEqual(['1', 'isHide']);
  });
});
