import { RichText, type RichTextProps } from '@shop/storefront-blocks';

const FLAT: RichTextProps['style'] = { marginY: 'none', paddingX: 'none', radius: 'none' };
const EVERYONE: RichTextProps['visibility'] = { audience: 'all', platforms: [] };

/**
 * Operator HTML (协议, 资讯) drawn natively: the DIY 富文本 block without its frame, so the
 * same allow-list and typography apply everywhere. Links inside are not tappable in a
 * mini-program; `extractLinks` lists them separately.
 */
export function RichContent({ html }: { html: string }) {
  return <RichText props={{ html, style: FLAT, visibility: EVERYONE }} />;
}
