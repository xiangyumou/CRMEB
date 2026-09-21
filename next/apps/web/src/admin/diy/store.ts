import type { DiyPageDetail } from '@shop/contracts/diy/schemas';
import type { DiyComponentKey } from '@shop/contracts/diy/schema/registry';
import {
  diyPageEntriesInOrder,
  reindexDiyPageValue,
  type DiyPageBackground,
  type DiyPageEntry,
  type DiyPageKind,
  type DiyPageStatus,
  type DiyPageValue,
} from '@shop/contracts/diy/schema/page';

import { diyComponentDefaults, type DiyComponentWithDefault } from './defaults';
import type { DiyComponentValue } from './panel-api';

/**
 * The decoration editor's state.
 *
 * Deliberately a `useReducer` rather than a store library: undo/redo wants a
 * single serialisable snapshot per edit, which is what a reducer already
 * produces, and adding a dependency would mean editing a `package.json` this
 * stream does not own.
 *
 * Three things the legacy editor did that this reproduces exactly, because the
 * saved bytes depend on them:
 *
 * 1. **Order lives in `timestamp`, not in key order.** `diyIndex.vue:739`
 *    rewrites every node's timestamp to `Date.now() * 1000 + index` after a
 *    drag. This store only rewrites when the order actually needs it (see
 *    `stampNodes`), so opening a page and saving it unchanged leaves it
 *    unchanged.
 * 2. **`id` is `'id' + timestamp`.** Written by `mobildConfig.js:445`. Kept in
 *    step whenever a timestamp moves.
 * 3. **`pageFoot` / `bottomMenu` are appended by the page, not dragged.**
 *    `diyIndex.vue:1180` adds `pageFoot` to every home page on save and
 *    `bottomMenu` to every product-detail page. They are held aside in
 *    `footer` and re-appended on serialise, which is why `DiyPanelContext.remove`
 *    is absent for them.
 */

// ---------------------------------------------------------------------------
// shapes
// ---------------------------------------------------------------------------

/**
 * One row of the canvas.
 *
 * `uid` is this editor's own identity and never reaches the saved page. It has
 * to exist because `timestamp` is not stable (a drag rewrites it), is not
 * unique (two production pages store a node under the key `"undefined"`) and is
 * not always present (`pageFoot` in `prod-6` has none).
 */
export interface DiyEditorNode {
  uid: string;
  /** The saved node, verbatim. Replaced wholesale, never mutated. */
  value: DiyComponentValue;
  /** The object key this node arrived under, for nodes that keep no timestamp. */
  sourceKey: string;
}

export interface DiyPageMeta {
  id: string;
  name: string;
  title: string | null;
  kind: DiyPageKind;
  status: DiyPageStatus;
  isHome: boolean;
  background: DiyPageBackground | null;
  /** The optimistic-concurrency token this state was loaded at. */
  version: string;
}

/** What the page-settings pane edits; the rest of `DiyPageMeta` is server-owned. */
export type DiyPageMetaPatch = Partial<Pick<DiyPageMeta, 'name' | 'title' | 'background'>>;

/** The selection sentinel for "the page itself", shown in the right-hand pane. */
export const DIY_PAGE_SELECTION = '@page';

interface DiySnapshot {
  meta: DiyPageMeta;
  nodes: readonly DiyEditorNode[];
  footer: DiyEditorNode | null;
  selected: string;
}

export interface DiyEditorState extends DiySnapshot {
  past: readonly DiySnapshot[];
  future: readonly DiySnapshot[];
  /** The snapshot the last save wrote, for the dirty check. */
  baseline: DiySnapshot;
  /** Monotonic counter behind `uid`, so identities are deterministic in tests. */
  seq: number;
  /**
   * The node whose panel produced the most recent edit. Consecutive edits to
   * one component collapse into a single undo entry — otherwise dragging a
   * slider would bury the rest of the history under a hundred steps.
   */
  coalescing: string | null;
}

const HISTORY_LIMIT = 50;

// ---------------------------------------------------------------------------
// placement rules (ported from diyIndex.vue)
// ---------------------------------------------------------------------------

/** Components the legacy editor allowed at most one of. `diyIndex.vue:840`. */
export const DIY_SINGLETON_KEYS = ['headerSerch', 'tabNav', 'homeComb', 'customerService'] as const;

/**
 * `homeComb` (轮播搜索) bundles a banner with a search box, so it cannot share a
 * page with the standalone search box or with the tab bar — `diyIndex.vue:835`,
 * which checks `isSearch || isTab` when adding it and `isComb` when adding
 * either of them. 搜索框 and 选项卡 do coexist; the tab bar is placed directly
 * under the search box.
 */
const EXCLUSIVE_GROUPS: readonly (readonly string[])[] = [
  ['homeComb', 'headerSerch'],
  ['homeComb', 'tabNav'],
];

/**
 * Components pinned to the top of the page, in this order. The legacy editor
 * both inserted them there and refused to drag them (`diyIndex.vue:797`).
 */
export const DIY_PINNED_KEYS = ['homeComb', 'headerSerch', 'tabNav'] as const;

/** `pageFoot` on a home page, `bottomMenu` on a product detail page. */
export function footerKeyFor(kind: DiyPageKind): DiyComponentKey | null {
  if (kind === 'home') return 'pageFoot';
  if (kind === 'product_detail') return 'bottomMenu';
  return null;
}

function nameOf(node: DiyComponentValue): string {
  return typeof node.name === 'string' ? node.name : '';
}

export function isPinned(node: DiyComponentValue): boolean {
  return (DIY_PINNED_KEYS as readonly string[]).includes(nameOf(node));
}

/** Where a newly added component is allowed to land, given the current page. */
function insertionIndexFor(key: string, nodes: readonly DiyEditorNode[], after: number): number {
  const pinnedRank = DIY_PINNED_KEYS.indexOf(key as (typeof DIY_PINNED_KEYS)[number]);
  if (pinnedRank >= 0) {
    // Sit after every pinned component that outranks this one, before the rest.
    let index = 0;
    while (index < nodes.length) {
      const otherNode = nodes[index];
      if (!otherNode) break;
      const otherRank = DIY_PINNED_KEYS.indexOf(
        nameOf(otherNode.value) as (typeof DIY_PINNED_KEYS)[number],
      );
      if (otherRank < 0 || otherRank > pinnedRank) break;
      index += 1;
    }
    return index;
  }
  const floor = nodes.filter((node) => isPinned(node.value)).length;
  const requested = after < 0 ? nodes.length : after;
  return Math.max(floor, Math.min(requested, nodes.length));
}

export type DiyAddRejection =
  { reason: 'duplicate'; message: string } | { reason: 'exclusive'; message: string };

/** Why a palette entry is disabled, or `null` when it may be added. */
export function rejectAdd(
  key: string,
  nodes: readonly DiyEditorNode[],
  labelOf: (key: string) => string,
): DiyAddRejection | null {
  const present = new Set(nodes.map((node) => nameOf(node.value)));
  if ((DIY_SINGLETON_KEYS as readonly string[]).includes(key) && present.has(key)) {
    return { reason: 'duplicate', message: `${labelOf(key)}只能添加一次` };
  }
  for (const group of EXCLUSIVE_GROUPS) {
    if (!group.includes(key)) continue;
    const clash = group.find((other) => other !== key && present.has(other));
    if (clash) {
      return {
        reason: 'exclusive',
        message: `${labelOf(key)}不能与${labelOf(clash)}同时使用`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// load / serialise
// ---------------------------------------------------------------------------

function snapshotOf(state: DiyEditorState): DiySnapshot {
  return { meta: state.meta, nodes: state.nodes, footer: state.footer, selected: state.selected };
}

function metaOf(detail: DiyPageDetail): DiyPageMeta {
  return {
    id: detail.id,
    name: detail.name,
    title: detail.title,
    kind: detail.kind,
    status: detail.status,
    isHome: detail.isHome,
    background: detail.background,
    version: detail.version,
  };
}

/** Splits the loaded page into canvas rows and the page-owned footer. */
function splitEntries(
  entries: readonly DiyPageEntry[],
  kind: DiyPageKind,
): { nodes: DiyEditorNode[]; footer: DiyEditorNode | null; seq: number } {
  const footerName = footerKeyFor(kind);
  const nodes: DiyEditorNode[] = [];
  let footer: DiyEditorNode | null = null;
  let seq = 0;

  for (const entry of entries) {
    seq += 1;
    const node: DiyEditorNode = {
      uid: `n${seq}`,
      value: entry.node as DiyComponentValue,
      sourceKey: entry.key,
    };
    // A footer node on a page that no longer wants one stays on the canvas
    // rather than being dropped — losing a component on load is unforgivable.
    if (footerName && nameOf(node.value) === footerName && !footer) footer = node;
    else nodes.push(node);
  }
  return { nodes, footer, seq };
}

export function createDiyEditorState(detail: DiyPageDetail): DiyEditorState {
  const entries = diyPageEntriesInOrder(detail.content as DiyPageValue);
  const { nodes, footer, seq } = splitEntries(entries, detail.kind);
  const snapshot: DiySnapshot = {
    meta: metaOf(detail),
    nodes,
    footer,
    selected: nodes[0]?.uid ?? DIY_PAGE_SELECTION,
  };
  return { ...snapshot, past: [], future: [], baseline: snapshot, seq, coalescing: null };
}

function timestampOf(node: DiyComponentValue): number | null {
  const raw = node.timestamp;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** True when every node already carries a strictly ascending timestamp. */
function isOrdered(nodes: readonly DiyEditorNode[]): boolean {
  let previous = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const stamp = timestampOf(node.value);
    if (stamp === null || stamp <= previous) return false;
    previous = stamp;
  }
  return true;
}

/**
 * Rewrites `timestamp` (and the `id` derived from it) so the page's order is
 * recoverable from the saved data — but only when it has to be.
 *
 * The legacy editor rewrote every timestamp on every drag and every save, which
 * meant a page changed even when nothing about it had. Here the page is left
 * exactly as it was loaded unless its order is no longer ascending, which is
 * the only thing the renderer reads the field for.
 */
function stampNodes(nodes: readonly DiyEditorNode[], now: number): readonly DiyEditorNode[] {
  if (isOrdered(nodes)) return nodes;
  const base = now * 1000;
  return nodes.map((node, index) => {
    const stamp = base + index;
    const value: DiyComponentValue = { ...node.value, timestamp: stamp };
    // Only pages that already carry `id` keep carrying it. `mobildConfig.js:445`.
    if ('id' in node.value) value.id = `id${stamp}`;
    return { ...node, value };
  });
}

export interface SerialiseOptions {
  /** `Date.now()`, injected so the tests are deterministic. */
  now?: number;
}

/**
 * The component map to save.
 *
 * The footer is appended last, exactly where the legacy editor put it, and a
 * page whose kind wants a footer but has none gets the factory one — which is
 * what `diyIndex.vue:1180` did on every save of a home page.
 */
export function toDiyContent(state: DiyEditorState, options: SerialiseOptions = {}): DiyPageValue {
  const now = options.now ?? Date.now();
  const body = stampNodes(state.nodes, now);
  const footer = state.footer ?? defaultFooterFor(state.meta.kind);

  const entries: DiyPageEntry[] = body.map((node) => ({
    key: node.sourceKey,
    node: node.value as DiyPageEntry['node'],
  }));
  if (footer) {
    entries.push({
      // `prod-6` stores its `pageFoot` under a fresh stamp with no `timestamp`
      // field at all, so the key has to stand on its own.
      key: footer.sourceKey || String(now * 1000 + body.length),
      node: trailing(footer.value, body, now) as DiyPageEntry['node'],
    });
  }
  return reindexDiyPageValue(entries);
}

/**
 * Keeps the footer last in render order.
 *
 * The renderer sorts by `timestamp` (`pageDesign.vue:561`), so a footer that
 * kept an old stamp while the body was restamped with today's clock would be
 * drawn at the top of the page. Legacy had the same hole and papered over it by
 * saving `pageFoot` without a `timestamp` at all, which sorts last by accident.
 * This only touches the node when it would otherwise sort wrong.
 */
function trailing(
  footer: DiyComponentValue,
  body: readonly DiyEditorNode[],
  now: number,
): DiyComponentValue {
  const stamp = timestampOf(footer);
  if (stamp === null) return footer;
  const lastBody = body.at(-1);
  const previous = lastBody ? timestampOf(lastBody.value) : null;
  if (previous === null || stamp > previous) return footer;
  const next = Math.max(previous + 1, now * 1000 + body.length);
  const value: DiyComponentValue = { ...footer, timestamp: next };
  if ('id' in footer) value.id = `id${next}`;
  return value;
}

function defaultFooterFor(kind: DiyPageKind): DiyEditorNode | null {
  const key = footerKeyFor(kind);
  if (!key) return null;
  const value = createComponentValue(key);
  if (!value) return null;
  return { uid: '@footer', value, sourceKey: '' };
}

/** A fresh node body from the factory defaults, deep-copied. */
export function createComponentValue(key: string): DiyComponentValue | null {
  const preset = diyComponentDefaults[key as DiyComponentWithDefault] as
    DiyComponentValue | undefined;
  if (!preset) return null;
  return structuredClone(preset) as DiyComponentValue;
}

/** Whether anything has changed since the page was loaded or last saved. */
export function isDirty(state: DiyEditorState): boolean {
  return (
    state.meta !== state.baseline.meta ||
    state.nodes !== state.baseline.nodes ||
    state.footer !== state.baseline.footer
  );
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export type DiyEditorAction =
  | { type: 'load'; detail: DiyPageDetail }
  | { type: 'select'; uid: string }
  | { type: 'add'; key: string; at?: number; now?: number }
  | { type: 'update'; uid: string; value: DiyComponentValue }
  | { type: 'remove'; uid: string }
  | { type: 'duplicate'; uid: string; now?: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'toggleHide'; uid: string }
  | { type: 'reset'; uid: string }
  | { type: 'patchMeta'; patch: DiyPageMetaPatch }
  | { type: 'undo' }
  | { type: 'redo' }
  /** After a successful save: adopt the new token and drop the dirty flag. */
  | { type: 'saved'; version: string; status: DiyPageStatus; isHome?: boolean };

function commit(
  state: DiyEditorState,
  next: Partial<DiySnapshot>,
  coalescing: string | null = null,
): DiyEditorState {
  const previous = snapshotOf(state);
  // A run of edits to one component is one undo step, not one per keystroke.
  const past =
    coalescing !== null && coalescing === state.coalescing
      ? state.past
      : [...state.past, previous].slice(-HISTORY_LIMIT);
  return { ...state, ...next, past, future: [], coalescing };
}

function indexOf(nodes: readonly DiyEditorNode[], uid: string): number {
  return nodes.findIndex((node) => node.uid === uid);
}

export function diyEditorReducer(state: DiyEditorState, action: DiyEditorAction): DiyEditorState {
  switch (action.type) {
    case 'load':
      return createDiyEditorState(action.detail);

    case 'select':
      return state.selected === action.uid
        ? state
        : { ...state, selected: action.uid, coalescing: null };

    case 'add': {
      const value = createComponentValue(action.key);
      if (!value) return state;
      if (rejectAdd(action.key, state.nodes, (key) => key)) return state;
      const seq = state.seq + 1;
      const now = action.now ?? Date.now();
      const stamp = now * 1000 + state.nodes.length;
      const node: DiyEditorNode = {
        uid: `n${seq}`,
        value: { ...value, timestamp: stamp, id: `id${stamp}` },
        sourceKey: String(stamp),
      };
      const at = insertionIndexFor(action.key, state.nodes, action.at ?? -1);
      const nodes = [...state.nodes.slice(0, at), node, ...state.nodes.slice(at)];
      return { ...commit(state, { nodes, selected: node.uid }), seq };
    }

    case 'update': {
      const index = indexOf(state.nodes, action.uid);
      if (index >= 0) {
        const current = state.nodes[index];
        if (!current || current.value === action.value) return state;
        const nodes = [...state.nodes];
        nodes[index] = { ...current, value: action.value };
        return commit(state, { nodes }, action.uid);
      }
      if (state.footer && state.footer.uid === action.uid) {
        if (state.footer.value === action.value) return state;
        return commit(state, { footer: { ...state.footer, value: action.value } }, action.uid);
      }
      return state;
    }

    case 'remove': {
      const index = indexOf(state.nodes, action.uid);
      if (index < 0) return state;
      const nodes = state.nodes.filter((node) => node.uid !== action.uid);
      const selected = nodes[Math.min(index, nodes.length - 1)]?.uid ?? DIY_PAGE_SELECTION;
      return commit(state, { nodes, selected });
    }

    case 'duplicate': {
      const index = indexOf(state.nodes, action.uid);
      const source = index < 0 ? undefined : state.nodes[index];
      if (!source) return state;
      const key = nameOf(source.value);
      if (rejectAdd(key, state.nodes, (k) => k)) return state;
      const seq = state.seq + 1;
      const now = action.now ?? Date.now();
      const stamp = now * 1000 + state.nodes.length;
      const value: DiyComponentValue = { ...structuredClone(source.value), timestamp: stamp };
      if ('id' in source.value) value.id = `id${stamp}`;
      const node: DiyEditorNode = { uid: `n${seq}`, value, sourceKey: String(stamp) };
      const nodes = [...state.nodes];
      nodes.splice(index + 1, 0, node);
      return { ...commit(state, { nodes, selected: node.uid }), seq };
    }

    case 'move': {
      const { from, to } = action;
      const source = state.nodes[from];
      if (!source || from === to || to < 0 || to >= state.nodes.length) return state;
      // The pinned block keeps its place; the legacy editor refused the drag
      // outright (`diyIndex.vue:797`) and so does this.
      const floor = state.nodes.filter((node) => isPinned(node.value)).length;
      if (isPinned(source.value) || to < floor) return state;
      const nodes = [...state.nodes];
      nodes.splice(from, 1);
      nodes.splice(to, 0, source);
      return commit(state, { nodes });
    }

    case 'toggleHide': {
      const index = indexOf(state.nodes, action.uid);
      const current = index < 0 ? undefined : state.nodes[index];
      if (!current) return state;
      const nodes = [...state.nodes];
      nodes[index] = { ...current, value: { ...current.value, isHide: !current.value.isHide } };
      return commit(state, { nodes });
    }

    case 'reset': {
      const index = indexOf(state.nodes, action.uid);
      const current = index < 0 ? undefined : state.nodes[index];
      if (current) {
        const fresh = createComponentValue(nameOf(current.value));
        if (!fresh) return state;
        const nodes = [...state.nodes];
        // Identity survives a reset: same slot, same timestamp, same `id`.
        nodes[index] = {
          ...current,
          value: { ...fresh, timestamp: current.value.timestamp, ...idOf(current.value) },
        };
        return commit(state, { nodes });
      }
      if (state.footer && state.footer.uid === action.uid) {
        const fresh = createComponentValue(nameOf(state.footer.value));
        if (!fresh) return state;
        return commit(state, { footer: { ...state.footer, value: fresh } });
      }
      return state;
    }

    case 'patchMeta':
      return commit(state, { meta: { ...state.meta, ...action.patch } });

    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
        coalescing: null,
      };
    }

    case 'redo': {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        ...next,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: rest,
        coalescing: null,
      };
    }

    case 'saved': {
      const meta: DiyPageMeta = {
        ...state.meta,
        version: action.version,
        status: action.status,
        isHome: action.isHome ?? state.meta.isHome,
      };
      const baseline: DiySnapshot = { ...snapshotOf(state), meta };
      return { ...state, meta, baseline, coalescing: null };
    }

    default:
      return state;
  }
}

function idOf(value: DiyComponentValue): { id?: unknown } {
  return 'id' in value ? { id: value.id } : {};
}

export const canUndo = (state: DiyEditorState): boolean => state.past.length > 0;
export const canRedo = (state: DiyEditorState): boolean => state.future.length > 0;

/** The node behind the current selection, or `null` when the page is selected. */
export function selectedNode(state: DiyEditorState): DiyEditorNode | null {
  if (state.selected === DIY_PAGE_SELECTION) return null;
  return (
    state.nodes.find((node) => node.uid === state.selected) ??
    (state.footer?.uid === state.selected ? state.footer : null)
  );
}
