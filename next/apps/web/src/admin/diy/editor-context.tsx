'use client';

import { createContext, useContext, type Dispatch, type ReactNode } from 'react';

import type { DiyTheme } from './panel-api';
import type { DiyEditorAction, DiyEditorState } from './store';

/**
 * The three panes share one reducer. A context rather than prop drilling
 * because the canvas rows, the palette entries and the panel header all
 * dispatch, and threading `dispatch` through five levels of layout would be the
 * only thing most of those components did.
 */

export interface DiyEditorContextValue {
  state: DiyEditorState;
  dispatch: Dispatch<DiyEditorAction>;
  /** True while the page may not be edited: no permission, or a save in flight. */
  readOnly: boolean;
  /** The active storefront theme's colours, handed to previews and to panels. */
  theme: DiyTheme;
}

const DiyEditorContext = createContext<DiyEditorContextValue | null>(null);

export function DiyEditorProvider({
  value,
  children,
}: {
  value: DiyEditorContextValue;
  children: ReactNode;
}) {
  return <DiyEditorContext value={value}>{children}</DiyEditorContext>;
}

export function useDiyEditor(): DiyEditorContextValue {
  const value = useContext(DiyEditorContext);
  if (!value) throw new Error('useDiyEditor 必须在 <DiyEditorProvider> 内部使用');
  return value;
}
