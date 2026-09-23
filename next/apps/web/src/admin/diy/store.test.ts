import type { DiyPageDetail } from '@shop/contracts/diy/schemas';
import {
  diyPageEntriesInOrder,
  parseDiyPageValue,
  serialiseDiyPageValue,
} from '@shop/contracts/diy/schema/page';
import { describe, expect, it } from 'vitest';

import { titlesDefault } from './defaults';
import {
  canRedo,
  canUndo,
  createDiyEditorState,
  DIY_PAGE_SELECTION,
  diyEditorReducer,
  isDirty,
  rejectAdd,
  selectedNode,
  toDiyContent,
  type DiyEditorAction,
  type DiyEditorState,
} from './store';

/** A saved page with three ordered nodes, as the wire delivers it. */
function content(...names: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  names.forEach((name, index) => {
    const timestamp = 1740450007006000 + index;
    out[String(timestamp)] = {
      cname: name,
      name,
      timestamp,
      id: `id${timestamp}`,
      isHide: false,
    };
  });
  return out;
}

function detail(overrides: Partial<DiyPageDetail> = {}): DiyPageDetail {
  return {
    id: '1',
    name: '默认首页',
    kind: 'home',
    title: '商城首页',
    status: 'draft',
    isHome: true,
    componentCount: 0,
    version: '1716451200000-abc',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00+08:00',
    updatedAt: '2026-01-01T00:00:00+08:00',
    content: {},
    schemaVersion: 1,
    background: null,
    ...overrides,
  };
}

function run(state: DiyEditorState, ...actions: DiyEditorAction[]): DiyEditorState {
  return actions.reduce(diyEditorReducer, state);
}

describe('loading a page', () => {
  it('keeps the nodes in render order and selects the first', () => {
    const state = createDiyEditorState(detail({ content: content('titles', 'guide', 'news') }));
    expect(state.nodes.map((node) => node.value.name)).toEqual(['titles', 'guide', 'news']);
    expect(state.selected).toBe(state.nodes[0]?.uid);
    expect(isDirty(state)).toBe(false);
  });

  it('selects the page itself when there are no components', () => {
    expect(createDiyEditorState(detail()).selected).toBe(DIY_PAGE_SELECTION);
  });

  it('lifts pageFoot off the canvas on a home page', () => {
    const state = createDiyEditorState(detail({ content: content('titles', 'pageFoot') }));
    expect(state.nodes.map((node) => node.value.name)).toEqual(['titles']);
    expect(state.footer?.value.name).toBe('pageFoot');
  });

  it('lifts bottomMenu off the canvas on a product detail page', () => {
    const state = createDiyEditorState(
      detail({ kind: 'product_detail', content: content('productInfo', 'bottomMenu') }),
    );
    expect(state.nodes.map((node) => node.value.name)).toEqual(['productInfo']);
    expect(state.footer?.value.name).toBe('bottomMenu');
  });

  it('leaves a stray footer on the canvas rather than losing it', () => {
    // A `pageFoot` on a micro page has no footer slot to go in. Dropping it
    // would delete a component on load, which is never acceptable.
    const state = createDiyEditorState(detail({ kind: 'micro', content: content('pageFoot') }));
    expect(state.footer).toBeNull();
    expect(state.nodes).toHaveLength(1);
  });
});

describe('serialising', () => {
  it('reproduces an untouched page byte for byte', () => {
    // A home page grows a `pageFoot` on save, so the page that
    // has to come back unchanged is one that already carries its footer.
    const saved = content('titles', 'guide', 'news', 'pageFoot');
    const state = createDiyEditorState(detail({ content: saved }));
    expect(serialiseDiyPageValue(toDiyContent(state, { now: 1 }))).toBe(
      serialiseDiyPageValue(parseDiyPageValue(saved)),
    );
  });

  it('rewrites timestamps and ids only once the order actually moves', () => {
    const state = createDiyEditorState(
      detail({ content: content('titles', 'guide', 'news', 'pageFoot') }),
    );
    const moved = run(state, { type: 'move', from: 2, to: 0 });
    const value = toDiyContent(moved, { now: 1_700_000_000_000 });
    const entries = diyPageEntriesInOrder(value);
    expect(entries.map((entry) => (entry.node as { name?: string }).name)).toEqual([
      'news',
      'titles',
      'guide',
      'pageFoot',
    ]);
    // Key, `timestamp` and `id` all agree, which is what the renderer expects.
    let previous = 0;
    for (const entry of entries) {
      const node = entry.node as { timestamp?: number; id?: string };
      expect(entry.key).toBe(String(node.timestamp));
      expect(node.id).toBe(`id${node.timestamp}`);
      // And they ascend, so the renderer's own sort reproduces this order.
      expect(node.timestamp).toBeGreaterThan(previous);
      previous = node.timestamp ?? 0;
    }
  });

  it('pushes the footer past the body when the body is restamped', () => {
    // The body picks up today's clock on a reorder; a footer left on a 2025
    // stamp would sort to the top of the page.
    const state = createDiyEditorState(detail({ content: content('titles', 'guide', 'pageFoot') }));
    const value = toDiyContent(run(state, { type: 'move', from: 1, to: 0 }), { now: 1 });
    const entries = diyPageEntriesInOrder(value);
    expect(entries.map((entry) => (entry.node as { name?: string }).name)).toEqual([
      'guide',
      'titles',
      'pageFoot',
    ]);
  });

  it('appends the factory footer to a home page that has none', () => {
    const state = createDiyEditorState(detail({ content: content('titles') }));
    const names = diyPageEntriesInOrder(toDiyContent(state, { now: 1 })).map(
      (entry) => (entry.node as { name?: string }).name,
    );
    expect(names).toEqual(['titles', 'pageFoot']);
  });

  it('gives a micro page no footer at all', () => {
    const state = createDiyEditorState(detail({ kind: 'micro', content: content('titles') }));
    const names = diyPageEntriesInOrder(toDiyContent(state, { now: 1 })).map(
      (entry) => (entry.node as { name?: string }).name,
    );
    expect(names).toEqual(['titles']);
  });

  it('produces a page the contract schemas accept', () => {
    const state = run(createDiyEditorState(detail()), { type: 'add', key: 'titles', now: 1 });
    expect(() => parseDiyPageValue(toDiyContent(state, { now: 1 }))).not.toThrow();
  });
});

describe('adding', () => {
  it('drops in the factory default with a fresh identity', () => {
    const state = run(createDiyEditorState(detail()), { type: 'add', key: 'titles', now: 1000 });
    const node = state.nodes[0];
    expect(node?.value.name).toBe('titles');
    expect(node?.value.timestamp).toBe(1_000_000);
    expect(node?.value.id).toBe('id1000000');
    expect(state.selected).toBe(node?.uid);
    // A deep copy, not the shared module-level default.
    expect(node?.value).not.toBe(titlesDefault);
  });

  it('pins 轮播搜索 and 搜索框 to the top of the page', () => {
    let state = createDiyEditorState(detail({ content: content('titles', 'news') }));
    state = run(state, { type: 'add', key: 'headerSerch', now: 1 });
    expect(state.nodes.map((node) => node.value.name)).toEqual(['headerSerch', 'titles', 'news']);
    state = run(state, { type: 'add', key: 'tabNav', now: 2 });
    expect(state.nodes.map((node) => node.value.name)).toEqual([
      'headerSerch',
      'tabNav',
      'titles',
      'news',
    ]);
  });

  it('refuses a second 搜索框', () => {
    const state = createDiyEditorState(detail({ content: content('headerSerch') }));
    expect(rejectAdd('headerSerch', state.nodes, (k) => k)?.reason).toBe('duplicate');
    expect(run(state, { type: 'add', key: 'headerSerch' }).nodes).toHaveLength(1);
  });

  it('refuses 轮播搜索 beside 搜索框', () => {
    const state = createDiyEditorState(detail({ content: content('headerSerch') }));
    expect(rejectAdd('homeComb', state.nodes, (k) => k)?.reason).toBe('exclusive');
  });
});

describe('editing', () => {
  it('ignores an update that hands back the same object', () => {
    const state = createDiyEditorState(detail({ content: content('titles') }));
    const uid = state.nodes[0]!.uid;
    const same = run(state, { type: 'update', uid, value: state.nodes[0]!.value });
    expect(same).toBe(state);
  });

  it('collapses a run of edits to one component into one undo step', () => {
    let state = createDiyEditorState(detail({ content: content('titles') }));
    const uid = state.nodes[0]!.uid;
    state = run(
      state,
      { type: 'update', uid, value: { ...state.nodes[0]!.value, a: 1 } },
      { type: 'update', uid, value: { name: 'titles', a: 2 } },
      { type: 'update', uid, value: { name: 'titles', a: 3 } },
    );
    expect(state.past).toHaveLength(1);
    expect(diyEditorReducer(state, { type: 'undo' }).nodes[0]?.value.a).toBeUndefined();
  });

  it('starts a new undo step once the selection moves', () => {
    let state = createDiyEditorState(detail({ content: content('titles', 'news') }));
    const [first, second] = state.nodes;
    state = run(
      state,
      { type: 'update', uid: first!.uid, value: { name: 'titles', a: 1 } },
      { type: 'select', uid: second!.uid },
      { type: 'update', uid: second!.uid, value: { name: 'news', b: 1 } },
    );
    expect(state.past).toHaveLength(2);
  });

  it('hides without deleting', () => {
    const state = createDiyEditorState(detail({ content: content('titles') }));
    const hidden = run(state, { type: 'toggleHide', uid: state.nodes[0]!.uid });
    expect(hidden.nodes).toHaveLength(1);
    expect(hidden.nodes[0]?.value.isHide).toBe(true);
  });

  it('duplicates a component next to the original with a new identity', () => {
    const state = createDiyEditorState(detail({ content: content('titles', 'news') }));
    const copied = run(state, { type: 'duplicate', uid: state.nodes[0]!.uid, now: 9 });
    expect(copied.nodes.map((node) => node.value.name)).toEqual(['titles', 'titles', 'news']);
    expect(copied.nodes[1]?.value.timestamp).not.toBe(copied.nodes[0]?.value.timestamp);
    expect(copied.nodes[1]?.uid).not.toBe(copied.nodes[0]?.uid);
  });

  it('refuses to duplicate a singleton', () => {
    const state = createDiyEditorState(detail({ content: content('headerSerch') }));
    expect(run(state, { type: 'duplicate', uid: state.nodes[0]!.uid }).nodes).toHaveLength(1);
  });

  it('resets a component but keeps its slot, timestamp and id', () => {
    const state = createDiyEditorState(detail({ content: content('titles') }));
    const uid = state.nodes[0]!.uid;
    const before = state.nodes[0]!.value;
    const reset = run(
      state,
      { type: 'update', uid, value: { ...before, titleConfig: { value: '改过了' } } },
      { type: 'reset', uid },
    );
    expect(reset.nodes[0]?.value.timestamp).toBe(before.timestamp);
    expect(reset.nodes[0]?.value.id).toBe(before.id);
    expect(reset.nodes[0]?.value.titleConfig).toEqual(titlesDefault.titleConfig);
  });

  it('removes a component and selects its neighbour', () => {
    const state = createDiyEditorState(detail({ content: content('titles', 'news') }));
    const removed = run(state, { type: 'remove', uid: state.nodes[0]!.uid });
    expect(removed.nodes).toHaveLength(1);
    expect(selectedNode(removed)?.value.name).toBe('news');
  });

  it('will not drag a pinned component out of the top block', () => {
    const state = createDiyEditorState(detail({ content: content('headerSerch', 'titles') }));
    expect(run(state, { type: 'move', from: 0, to: 1 })).toBe(state);
    expect(run(state, { type: 'move', from: 1, to: 0 })).toBe(state);
  });
});

describe('history and dirtiness', () => {
  it('undoes and redoes', () => {
    let state = createDiyEditorState(detail({ content: content('titles') }));
    expect(canUndo(state)).toBe(false);
    state = run(state, { type: 'add', key: 'news', now: 1 });
    expect(canUndo(state)).toBe(true);
    state = diyEditorReducer(state, { type: 'undo' });
    expect(state.nodes).toHaveLength(1);
    expect(canRedo(state)).toBe(true);
    state = diyEditorReducer(state, { type: 'redo' });
    expect(state.nodes).toHaveLength(2);
  });

  it('is dirty after an edit and clean again after a save', () => {
    let state = createDiyEditorState(detail({ content: content('titles') }));
    state = run(state, { type: 'add', key: 'news', now: 1 });
    expect(isDirty(state)).toBe(true);
    state = run(state, { type: 'saved', version: 'v2', status: 'published' });
    expect(isDirty(state)).toBe(false);
    expect(state.meta.version).toBe('v2');
    expect(state.meta.status).toBe('published');
  });

  it('tracks page settings too', () => {
    const state = createDiyEditorState(detail());
    const renamed = run(state, { type: 'patchMeta', patch: { name: '改名了' } });
    expect(isDirty(renamed)).toBe(true);
    expect(diyEditorReducer(renamed, { type: 'undo' }).meta.name).toBe('默认首页');
  });
});
