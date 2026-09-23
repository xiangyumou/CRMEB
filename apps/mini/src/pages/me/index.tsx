import { Placeholder } from '@/shell/placeholder';
import { useTabBarSync } from '@/shell/use-tab-bar-sync';

export default function Me() {
  useTabBarSync();
  return <Placeholder title="我的" />;
}
