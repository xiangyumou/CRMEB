import { RichText as NativeRichText } from '@tarojs/components';
import { useMemo } from 'react';

import type { RichTextProps as RichTextBlockProps } from '@shop/contracts/decor/all-blocks';
import { parseRichText, type RichTextNode } from '@shop/contracts/decor/rich-text';
import { BlockFrame } from '../shared/frame';
import type { BlockProps } from '../shared/types';
import styles from './rich-text.module.scss';

/**
 * Each tag's look, as an inline style. `<rich-text>` content cannot be reached
 * by the page's classes on every platform, so the typography travels on the
 * nodes themselves — in `em`, relative to the block's own font size, so
 * nothing needs a px transform. The operator's own (allow-listed) style comes
 * after and wins.
 */
const BASE_STYLE: Readonly<Record<string, string>> = {
  p: 'margin:0 0 0.6em;',
  div: 'margin:0;',
  h1: 'margin:0 0 0.5em;font-size:1.43em;font-weight:600;line-height:1.35;',
  h2: 'margin:0 0 0.5em;font-size:1.29em;font-weight:600;line-height:1.35;',
  h3: 'margin:0 0 0.5em;font-size:1.14em;font-weight:600;line-height:1.4;',
  h4: 'margin:0 0 0.5em;font-size:1em;font-weight:600;',
  h5: 'margin:0 0 0.5em;font-size:1em;font-weight:600;',
  h6: 'margin:0 0 0.5em;font-size:1em;font-weight:600;',
  ul: 'margin:0 0 0.6em;padding-left:1.4em;',
  ol: 'margin:0 0 0.6em;padding-left:1.4em;',
  li: 'margin:0 0 0.2em;',
  blockquote:
    'margin:0 0 0.6em;padding:0.2em 0 0.2em 0.8em;border-left:0.2em solid #e5e5e5;color:#666666;',
  pre: 'margin:0 0 0.6em;padding:0.6em;background:#f7f7f7;white-space:pre-wrap;word-break:break-all;font-size:0.86em;',
  code: 'font-family:Menlo,Consolas,monospace;font-size:0.93em;',
  hr: 'margin:0.8em 0;border:0;border-top:1px solid #e5e5e5;',
  img: 'margin:0 0 0.6em;',
};

function styled(nodes: readonly RichTextNode[]): RichTextNode[] {
  return nodes.map((node) => {
    if ('type' in node) return node;
    const base = BASE_STYLE[node.name] ?? '';
    const own = node.attrs?.style ?? '';
    const attrs = { ...node.attrs };
    if (base || own) attrs.style = base + own;
    return {
      name: node.name,
      attrs,
      ...(node.children ? { children: styled(node.children) } : {}),
    };
  });
}

/**
 * 富文本: the operator's text, from HTML that the server sanitised on save and
 * again on serve (DECOR-017). Parsing here goes through the same allow-list
 * a third time and yields the node list `<rich-text>` draws — no HTML string
 * ever reaches the renderer.
 */
export function RichText({ props }: BlockProps<RichTextBlockProps>) {
  const nodes = useMemo(() => styled(parseRichText(props.html)), [props.html]);
  return (
    <BlockFrame type="richText" frame={props.style} className={styles.body}>
      <NativeRichText className={styles.content} nodes={nodes} />
    </BlockFrame>
  );
}
