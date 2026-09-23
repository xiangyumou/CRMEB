import { Image, Text, Video as NativeVideo, View } from '@tarojs/components';

import type { VideoProps } from '@shop/contracts/decor/all-blocks';
import type { VideoRatio } from '@shop/contracts/decor/constants';
import { cx } from '../shared/css';
import { BlockFrame } from '../shared/frame';
import type { BlockProps } from '../shared/types';
import styles from './video.module.scss';

const RATIO_CLASS: Record<VideoRatio, string | undefined> = {
  '16:9': styles.wide,
  '4:3': styles.standard,
  '1:1': styles.square,
};

/**
 * 视频: one video in a fixed-ratio frame, with the native player's controls.
 *
 * Autoplay only when the operator turned it on (off by default). The player
 * is not mounted in the editor (the poster and a play mark stand in), nor
 * while the host reports an overlay open: a native `<video>` draws above
 * every view, so it is unmounted — which stops it — and the poster shows
 * until the overlay closes (design.md §2.6).
 */
export function Video({ props, host }: BlockProps<VideoProps>) {
  const still = host?.canvas === true || host?.overlayOpen === true;
  return (
    <BlockFrame type="video" frame={props.style}>
      <View className={cx(styles.frame, RATIO_CLASS[props.ratio])}>
        {still ? (
          <View className={styles.still} data-still="true">
            {props.poster ? (
              <Image className={styles.poster} src={props.poster} mode="aspectFill" />
            ) : null}
            <View className={styles.play}>
              <View className={styles.triangle} />
            </View>
            {host?.canvas && !props.poster ? <Text className={styles.hint}>视频</Text> : null}
          </View>
        ) : (
          <NativeVideo
            className={styles.player}
            src={props.src}
            {...(props.poster ? { poster: props.poster } : {})}
            controls
            autoplay={props.autoplay}
            muted={props.muted}
            loop={props.loop}
            objectFit="contain"
            showCenterPlayBtn
          />
        )}
      </View>
    </BlockFrame>
  );
}
