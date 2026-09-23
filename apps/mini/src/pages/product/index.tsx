import { Text } from '@tarojs/components';
import { useRouteQuery } from '@shop/api-client/react';
import { useCheckoutDraft } from '@/features/checkout/draft';
import { LoginCard } from '@/session/login-card';
import { navigate, useRouteParams, useShare } from '@/platform';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Empty } from '@/ui/empty';
import { PageShell } from '@/ui/page-shell';
import './index.scss';

/**
 * 商品详情 (`product`, `pages/product/index?id=`). Spike S4's plain version: name, price and
 * 立即购买 for the first SKU in stock. Stream B replaces the body (gallery, SkuSheet, reviews,
 * coupons, favourites, share); the route and the query parameter stay.
 */
export default function ProductPage() {
  const { id = '' } = useRouteParams('product');
  const product = useRouteQuery(
    'catalog.productDetail',
    { params: { id } },
    { enabled: id !== '' },
  );
  const setDraft = useCheckoutDraft((state) => state.setDraft);
  useShare(id ? { route: 'product', params: { id } } : null, { title: product.data?.name });

  if (id === '') return <Message text="没有指定商品" />;
  if (product.isPending) return <Message text="加载中…" />;
  if (product.isError) return <Message text={product.error.message} />;

  const sku = product.data.skus.find((candidate) => candidate.stock > 0);
  return (
    <PageShell title="商品详情">
      <Card>
        <Text className="s4-product__price" id="product-price">
          ¥{sku?.price ?? product.data.price}
        </Text>
        <Text className="s4-product__name" id="product-name">
          {product.data.name}
        </Text>
        {sku && product.data.skus.length > 1 ? (
          <Text className="s4-product__spec">{sku.specText}</Text>
        ) : null}
      </Card>
      <LoginCard reason="登录后即可购买" redirect={{ route: 'product', params: { id } }}>
        <Card>
          <Button
            size="lg"
            block
            disabled={!sku}
            onClick={() => {
              if (!sku) return;
              setDraft({ source: 'buy-now', skuId: sku.id, quantity: 1 });
              void navigate({ route: 'checkout', params: {} });
            }}
          >
            {sku ? '立即购买' : '已售罄'}
          </Button>
        </Card>
      </LoginCard>
    </PageShell>
  );
}

function Message({ text }: { text: string }) {
  return (
    <PageShell title="商品详情">
      <Empty title={text} />
    </PageShell>
  );
}
