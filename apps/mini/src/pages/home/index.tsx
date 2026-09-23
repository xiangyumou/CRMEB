import { useQuery } from '@tanstack/react-query';
import { Button, Text } from '@tarojs/components';
import { cartCountQuery } from '@/data/cart';
import { openPage } from '@/platform';
import { Placeholder, placeholderStyles } from '@/shell/placeholder';
import { useTabBarSync } from '@/shell/use-tab-bar-sync';

export default function Home() {
  useTabBarSync();
  const { data, isPending } = useQuery(cartCountQuery);
  return (
    <Placeholder title="首页">
      <Text className={placeholderStyles.muted}>
        {isPending ? '购物车加载中' : `购物车 ${data?.items ?? 0} 件`}
      </Text>
      <Button
        className={placeholderStyles.button}
        onClick={() => void openPage('subpackages/demo/pages/ui/index')}
      >
        组件示例
      </Button>
    </Placeholder>
  );
}
