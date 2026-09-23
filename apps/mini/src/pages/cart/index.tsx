import { useTabPage } from '@/app-shell/tab-page';
import { BuildingPage } from '@/ui/building-page';

/** 购物车 (tab `cart`). The body is stream B's; the tab bar and pending params are wired. */
export default function Cart() {
  useTabPage('cart');
  return <BuildingPage title="购物车" home={false} />;
}
