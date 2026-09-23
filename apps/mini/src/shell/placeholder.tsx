import type { ReactNode } from 'react';
import { Text, View } from '@tarojs/components';
import styles from './placeholder.module.scss';

/** Scaffolding for pages that stream B and later replace. */
export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <Text className={styles.title}>{title}</Text>
        <Text className={styles.muted}>占位页面</Text>
        {children}
      </View>
    </View>
  );
}

export const placeholderStyles = styles;
