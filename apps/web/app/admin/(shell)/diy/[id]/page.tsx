import type { Metadata } from 'next';

import { DiyEditor } from '@/admin/diy/editor';

export const metadata: Metadata = { title: '装修页面' };

/**
 * The editor is a client component end to end: it holds a reducer with an
 * undo stack and talks to the admin API with the operator's own cookie, so
 * there is nothing for the server to render ahead of it.
 */
export default async function DiyEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiyEditor pageId={id} />;
}
