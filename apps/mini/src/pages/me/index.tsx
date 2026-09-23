import { useTabPage } from '@/app-shell/tab-page';
import { BuildingPage } from '@/ui/building-page';

/** 我的 (tab `me`). The body is stream B's; the tab bar and pending params are wired. */
export default function Me() {
  useTabPage('me');
  return <BuildingPage title="我的" home={false} />;
}
