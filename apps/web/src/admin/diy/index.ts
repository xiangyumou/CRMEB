/**
 * 页面装修 (DIY) — the admin editor.
 *
 * Two audiences read this file. A config panel needs the stable panel API, the
 * shared field editors and the data-source port; nothing else in here concerns
 * it. Everyone else wants the two screens.
 */

// ── the stable panel API (every config panel builds against this) ─────────
export {
  bindDiyPanel,
  createDiyPanelRegistry,
  defineDiyPanel,
  DEFAULT_DIY_THEME,
} from './panel-api';
export type {
  AnyDiyPanelDefinition,
  DiyBinder,
  DiyComponentValue,
  DiyFieldProps,
  DiyPanelComponent,
  DiyPanelContext,
  DiyPanelDefinition,
  DiyPanelProps,
  DiyPanelRegistry,
  DiyTheme,
} from './panel-api';
export { DiyPanelHost, DiyRawPanel } from './panel-host';
export type { DiyPanelHostProps } from './panel-host';
export { diyPanelRegistry, diyPanels } from './panels';
export { DiyDataSourceProvider, useDiyDataSource } from './data-source';
export { createDiyDataSource } from './record-source';
export type {
  DiyDataSource,
  DiyPickerItem,
  DiyPickerKind,
  DiyPickerQuery,
  DiyPickerResult,
  DiyTreeNode,
} from './data-source';
export { diyComponentDefaults } from './defaults';
export type { DiyComponentWithDefault } from './defaults';

// ── the editor shell ────────────────────────────────────────────────────────
export { DiyEditor, storefrontPreviewPath } from './editor';
export { DiyEditorProvider, useDiyEditor } from './editor-context';
export type { DiyEditorContextValue } from './editor-context';
export { DiyCanvas } from './canvas';
export { DiyInspector } from './inspector';
export { DiyPalette, componentLabel, paletteGroupsFor } from './palette';
export { DiyPageSettings } from './page-settings';
export { DiyPageList } from './page-list';
export { DiyLinkList } from './link-list';
export { createDiyLinkSource, diyLinkTargets } from './link-source';
export { DiyPreview, diyPreviews } from './preview';
export type { DiyPreviewComponent, DiyPreviewProps } from './preview';

// ── the store ───────────────────────────────────────────────────────────────
export {
  canRedo,
  canUndo,
  createComponentValue,
  createDiyEditorState,
  DIY_PAGE_SELECTION,
  DIY_PINNED_KEYS,
  DIY_SINGLETON_KEYS,
  diyEditorReducer,
  footerKeyFor,
  isDirty,
  isPinned,
  rejectAdd,
  selectedNode,
  toDiyContent,
} from './store';
export type {
  DiyAddRejection,
  DiyEditorAction,
  DiyEditorNode,
  DiyEditorState,
  DiyPageMeta,
  DiyPageMetaPatch,
  SerialiseOptions,
} from './store';
