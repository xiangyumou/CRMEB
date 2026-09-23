import { Image, Text, View } from '@tarojs/components';
import type { ReactNode } from 'react';

import type { ServiceGridItem, ServiceGridProps } from '@shop/contracts/decor/all-blocks';
import { cx, tapProps } from '../shared/css';
import { BlockFrame } from '../shared/frame';
import type { BlockIntent, BlockProps } from '../shared/types';
import styles from './service-grid.module.scss';

const CONTACT: BlockIntent = { kind: 'contact' };

/**
 * 服务宫格: entries 4 or 5 to a row, each opening a link — or, for 联系客服,
 * asking the host for the `contact` intent. The block never opens 客服
 * itself: in WeChat that takes a native `<button open-type="contact">`,
 * which the host supplies through `renderIntent`; without one the tap is
 * reported through `onIntent`.
 */
export function ServiceGrid({
  props,
  onLink,
  onIntent,
  renderIntent,
}: BlockProps<ServiceGridProps>) {
  const face = (item: ServiceGridItem): ReactNode => (
    <>
      {item.icon ? (
        <Image className={styles.icon} src={item.icon} mode="aspectFit" />
      ) : (
        <View className={styles.glyph}>{[...item.label][0]}</View>
      )}
      <Text className={styles.label}>{item.label}</Text>
    </>
  );
  return (
    <BlockFrame type="serviceGrid" frame={props.style} className={styles.body}>
      {props.title ? <View className={styles.title}>{props.title}</View> : null}
      <View className={cx(styles.cells, props.columns === 4 ? styles.cols4 : styles.cols5)}>
        {props.items.map((item, index) => {
          if (item.action === 'contact') {
            return (
              <View
                key={index}
                className={styles.cell}
                data-intent="contact"
                {...(renderIntent ? {} : tapProps(onIntent ? () => onIntent(CONTACT) : undefined))}
              >
                {renderIntent ? renderIntent(CONTACT, face(item)) : face(item)}
              </View>
            );
          }
          const link = item.link;
          return (
            <View
              key={index}
              className={styles.cell}
              {...tapProps(link && onLink ? () => onLink(link) : undefined)}
            >
              {face(item)}
            </View>
          );
        })}
      </View>
    </BlockFrame>
  );
}
