import { useTabPage } from '@/app-shell/tab-page';
import { BuildingPage } from '@/ui/building-page';

/** 分类 (tab `category`). The body is stream B's; the tab bar and pending params are wired. */
export default function Category() {
  useTabPage('category');
  return <BuildingPage title="分类" home={false} />;
}
