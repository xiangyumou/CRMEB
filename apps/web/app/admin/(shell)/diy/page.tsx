import type { Metadata } from 'next';

import { DiyPageList } from '@/admin/diy/page-list';

export const metadata: Metadata = { title: '页面装修' };

export default function DiyListPage() {
  return <DiyPageList />;
}
