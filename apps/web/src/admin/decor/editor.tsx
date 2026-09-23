'use client';

import '@puckeditor/core/puck.css';

import { Puck, type Data } from '@puckeditor/core';
import blocksCss from '@shop/storefront-blocks/admin-css';
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';

import { buildDecorConfig } from './config';
import { DECOR_CUSTOM_FIELDS } from './fields';

/**
 * The page-decoration editor: Puck behind a props surface of our own, so the
 * route that mounts it never imports Puck and the library can be swapped
 * (docs/mini/spikes/S3-decor.md).
 *
 * The canvas is an iframe 375 px wide — a phone. It does **not** copy the
 * admin's styles in (`syncHostStyles: false`): antd's reset and the admin's
 * globals would restyle the blocks. It gets the blocks' own stylesheet
 * instead, the build of `@shop/storefront-blocks/admin-css`, whose design px
 * are already converted to vw — so inside a 375 px frame 750 design px is
 * exactly the frame's width, as on a phone.
 */

/** 375 × 812: an iPhone X-class screen, the width the storefront is designed at half of. */
export const CANVAS_WIDTH = 375;

const CANVAS_BASE_CSS = `
html, body { margin: 0; padding: 0; }
body { -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%; }
*, *::before, *::after { box-sizing: border-box; }
`;

/** Puts the blocks' stylesheet into the canvas iframe's own document. */
function CanvasStyles({ children, document }: { children: ReactNode; document?: Document }) {
  useEffect(() => {
    if (!document) return;
    const style = document.createElement('style');
    style.dataset.decorCanvas = 'blocks';
    style.textContent = CANVAS_BASE_CSS + blocksCss;
    document.head.append(style);
    return () => style.remove();
  }, [document]);
  return <>{children}</>;
}

export interface DecorEditorProps {
  /** Editor data; build it with `toPuckData(document)`. */
  data: Data;
  onChange: (data: Data) => void;
  onPublish?: ((data: Data) => void) | undefined;
  title?: string | undefined;
  height?: CSSProperties['height'] | undefined;
}

export function DecorEditor({
  data,
  onChange,
  onPublish,
  title,
  height = '100%',
}: DecorEditorProps) {
  const config = useMemo(() => buildDecorConfig(DECOR_CUSTOM_FIELDS), []);
  return (
    <Puck
      config={config}
      data={data}
      onChange={onChange}
      {...(onPublish ? { onPublish } : {})}
      {...(title ? { headerTitle: title } : {})}
      height={height}
      viewports={[{ width: CANVAS_WIDTH, height: 'auto', label: '手机', icon: 'Smartphone' }]}
      iframe={{ enabled: true, syncHostStyles: false }}
      overrides={{ iframe: CanvasStyles }}
    />
  );
}
