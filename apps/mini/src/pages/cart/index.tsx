import { Placeholder } from '@/shell/placeholder';
import { useTabBarSync } from '@/shell/use-tab-bar-sync';

export default function Cart() {
  useTabBarSync();
  return <Placeholder title="购物车" />;
}
