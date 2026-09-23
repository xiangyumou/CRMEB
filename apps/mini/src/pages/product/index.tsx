import { Button, Text, View } from '@tarojs/components';
import { useRouter } from '@tarojs/taro';
import { useRouteQuery } from '@shop/api-client/react';
import { useCheckoutDraft } from '@/features/checkout/draft';
import { LoginCard } from '@/features/session/login-card';
import { openPage } from '@/platform';
import { placeholderStyles as styles } from '@/shell/placeholder';

/**
 * 商品详情 (`product`, `pages/product/index?id=`). Spike S4's plain version: name, price and
 * 立即购买 for the first SKU in stock. Stream B replaces the body (gallery, SkuSheet, reviews,
 * coupons, favourites, share); the route and the query parameter stay.
 */
export default function ProductPage() {
  const id = useRouter().params.id ?? '';
  const product = useRouteQuery(
    'catalog.productDetail',
    { params: { id } },
    { enabled: id !== '' },
  );
  const setDraft = useCheckoutDraft((state) => state.setDraft);

  if (id === '') return <Message text="没有指定商品" />;
  if (product.isPending) return <Message text="加载中…" />;
  if (product.isError) return <Message text={product.error.message} />;

  const sku = product.data.skus.find((candidate) => candidate.stock > 0);
  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <Text className={styles.title} id="product-name">
          {product.data.name}
        </Text>
        <Text id="product-price">¥{sku?.price ?? product.data.price}</Text>
        {sku && product.data.skus.length > 1 ? (
          <Text className={styles.muted}>{sku.specText}</Text>
        ) : null}
      </View>
      <LoginCard reason="登录后即可购买">
        <Button
          className={styles.button}
          disabled={!sku}
          onClick={() => {
            if (!sku) return;
            setDraft({ source: 'buy-now', skuId: sku.id, quantity: 1 });
            void openPage('packages/order/checkout/index');
          }}
        >
          {sku ? '立即购买' : '已售罄'}
        </Button>
      </LoginCard>
    </View>
  );
}

function Message({ text }: { text: string }) {
  return (
    <View className={styles.page}>
      <Text className={styles.muted}>{text}</Text>
    </View>
  );
}
