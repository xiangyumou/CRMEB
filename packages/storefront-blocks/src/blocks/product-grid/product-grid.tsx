import { Image, Text, View } from '@tarojs/components';

import type { ProductSummary } from '@shop/contracts/decor/sources';
import type { ProductGridProps } from '@shop/contracts/decor/all-blocks';
import { cx, tapProps } from '../shared/css';
import { BlockFrame } from '../shared/frame';
import type { BlockProps } from '../shared/types';
import styles from './product-grid.module.scss';

export interface ProductGridData {
  products: ProductSummary[];
}

/** `"129.90"` → `["129", ".90"]`, so the yuan can be drawn larger than the fen. */
function splitPrice(price: string): [string, string] {
  const dot = price.indexOf('.');
  return dot < 0 ? [price, ''] : [price.slice(0, dot), price.slice(dot)];
}

/** 商品网格: two columns of product cards. The products arrive resolved in `data`. */
export function ProductGrid({
  props,
  data,
  onLink,
}: BlockProps<ProductGridProps, ProductGridData>) {
  const products = data?.products ?? [];
  return (
    <BlockFrame type="productGrid" frame={props.style}>
      {products.length === 0 ? (
        <View className={styles.empty}>暂无商品</View>
      ) : (
        <View className={styles.grid}>
          {products.map((product) => {
            const [yuan, fen] = splitPrice(product.price);
            return (
              <View
                key={product.id}
                className={styles.card}
                {...tapProps(
                  onLink ? () => onLink({ kind: 'product', id: product.id }) : undefined,
                )}
              >
                <View className={styles.media}>
                  <Image className={styles.image} src={product.image} mode="aspectFill" lazyLoad />
                  {props.showTag && product.tag ? (
                    <Text className={styles.tag}>{product.tag}</Text>
                  ) : null}
                </View>
                <View className={styles.body}>
                  <View
                    className={cx(
                      styles.title,
                      props.titleLines === 1 ? styles.lines1 : styles.lines2,
                    )}
                  >
                    {product.title}
                  </View>
                  <View className={styles.prices}>
                    <Text className={styles.price}>
                      <Text className={styles.minor}>¥</Text>
                      {yuan}
                      <Text className={styles.minor}>{fen}</Text>
                    </Text>
                    {props.showMarketPrice && product.marketPrice ? (
                      <Text className={styles.market}>¥{product.marketPrice}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </BlockFrame>
  );
}
