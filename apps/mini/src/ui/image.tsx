import { useState } from 'react';
import { Image as TaroImage, View } from '@tarojs/components';
import { assetUrl } from '@/lib/asset-url';
import { cx } from '@/lib/cx';
import { Icon } from './icon';
import './image.scss';

export interface ImageProps {
  /** An absolute URL or a server path (`/uploads/…`); `null` shows the placeholder. */
  src: string | null | undefined;
  /** What the picture shows (a product's name). Without it the image is decoration. */
  label?: string | undefined;
  /** width / height; the box keeps it before the picture arrives. Default 1 (square). */
  ratio?: number | undefined;
  /** `cover` crops to fill (default); `contain` shows it whole. */
  fit?: 'cover' | 'contain' | undefined;
  /** Rounded corners, following the shop's roundness. */
  radius?: 'none' | 'sm' | 'md' | undefined;
  /** Load when near the viewport (lists). Default on. */
  lazy?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A picture in a fixed-ratio box (design.md §4.1): grey while it loads, an icon if it fails.
 * The box is sized by CSS, not by the image, so a list does not jump as pictures arrive.
 */
export function Image({
  src,
  label,
  ratio = 1,
  fit = 'cover',
  radius = 'none',
  lazy = true,
  className,
}: ImageProps) {
  const url = assetUrl(src ?? null);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [shownUrl, setShownUrl] = useState(url);
  if (shownUrl !== url) {
    setShownUrl(url);
    setState('loading');
  }
  const failed = !url || state === 'error';
  return (
    <View
      className={cx(
        'shop-image',
        `shop-image--radius-${radius}`,
        state === 'loaded' && 'shop-image--loaded',
        className,
      )}
      style={{ paddingTop: `${(100 / ratio).toFixed(4)}%` }}
      {...(label ? { ariaRole: 'img', ariaLabel: label } : { ariaHidden: true })}
    >
      {failed ? (
        <View className="shop-image__fallback">
          <Icon name="image-plus" />
        </View>
      ) : (
        <TaroImage
          className="shop-image__img"
          src={url}
          mode={fit === 'cover' ? 'aspectFill' : 'aspectFit'}
          lazyLoad={lazy}
          ariaHidden
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
    </View>
  );
}
