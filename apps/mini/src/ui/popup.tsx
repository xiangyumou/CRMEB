/**
 * `src/ui` is the mini-program's UI kit. Pages import from here, never from `@nutui/*` (lint
 * enforces it), so replacing the component library touches this directory only.
 *
 * - One component per file, imported by path (`@/ui/popup`), no barrel: each file imports its
 *   NutUI piece and that piece's CSS, and a barrel would put every piece on every page.
 * - NutUI is imported per component from `dist/es/packages/<name>` plus `style/css`, never
 *   from the package root.
 * - NutUI's styles are drawn at 375 px; `config/index.ts` gives files under `@nutui` their own
 *   design width.
 */
import type { ReactNode } from 'react';
import NutPopup from '@nutui/nutui-react-taro/dist/es/packages/popup';
import '@nutui/nutui-react-taro/dist/es/packages/popup/style/css';
import { defined } from '@/lib/defined';

export interface PopupProps {
  visible: boolean;
  onClose: () => void;
  title?: string | undefined;
  position?: 'bottom' | 'center' | undefined;
  children?: ReactNode;
}

/** A sheet or dialog over the page. Rounded, closeable, closes on the overlay. */
export function Popup({ visible, onClose, title, position = 'bottom', children }: PopupProps) {
  return (
    <NutPopup
      visible={visible}
      position={position}
      round
      closeable
      onClose={onClose}
      {...defined({ title })}
    >
      {children}
    </NutPopup>
  );
}
