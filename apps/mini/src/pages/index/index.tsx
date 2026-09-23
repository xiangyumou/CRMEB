import { useTabPage } from '@/app-shell/tab-page';
import { BuildingPage } from '@/ui/building-page';

/** 首页 (tab `home`). The body is stream B's; the tab bar and pending params are wired. */
export default function Home() {
  useTabPage('home');
  return <BuildingPage title="首页" home={false} />;
}
