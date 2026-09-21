import type { Metadata } from 'next';

import { VirtualCardsPage } from './virtual-cards';

export const metadata: Metadata = { title: '卡密库存' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VirtualCardsPage productId={id} />;
}
