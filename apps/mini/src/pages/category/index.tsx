import { Placeholder } from '@/shell/placeholder';
import { useTabBarSync } from '@/shell/use-tab-bar-sync';

export default function Category() {
  useTabBarSync();
  return <Placeholder title="分类" />;
}
