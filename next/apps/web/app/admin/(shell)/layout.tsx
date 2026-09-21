import type { ReactNode } from 'react';

import { SessionProvider } from '@/admin/session/session-provider';
import { AdminShell } from '@/admin/shell/admin-shell';
import { ContentBoundary } from '@/admin/shell/content-boundary';

/**
 * Everything behind a login lives under this route group. The group's
 * parentheses keep it out of the URL: `app/admin/(shell)/coupons` is `/admin/coupons`.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AdminShell>
        <ContentBoundary>{children}</ContentBoundary>
      </AdminShell>
    </SessionProvider>
  );
}
