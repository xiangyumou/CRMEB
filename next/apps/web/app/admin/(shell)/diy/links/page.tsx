import type { Metadata } from 'next';

import { DiyLinkList } from '@/admin/diy/link-list';

export const metadata: Metadata = { title: '页面链接' };

export default function DiyLinksPage() {
  return <DiyLinkList />;
}
