import { useEffect, useRef } from 'react';
import { useRouteQuery } from '@shop/api-client/react';
import { DecorPage } from '@/features/decor/decor-page';
import { DecorSkeleton } from '@/features/decor/decor-states';
import { assetUrl } from '@/lib/asset-url';
import { usePullToRefresh, useRouteParams, useShare } from '@/platform';
import { useSignedIn } from '@/session/session';
import { Empty } from '@/ui/empty';
import { ErrorBlock } from '@/ui/error-block';
import { PageShell } from '@/ui/page-shell';

/**
 * 微页面 (`page { id }`): a published DIY v2 page, on the native navigation bar, rendered by the
 * same `DecorPage` as 首页. The title and the share card are the page's own; a page whose
 * operator switched sharing off shares the home page instead.
 */
export default function MicroPage() {
  const { id = '' } = useRouteParams('page');
  const signedIn = useSignedIn();
  const page = useRouteQuery('decor.pageResolve', { params: { id } }, { enabled: id !== '' });
  const root = page.data?.root.props;

  const lastSignedIn = useRef(signedIn);
  const { refetch } = page;
  useEffect(() => {
    if (lastSignedIn.current === signedIn || id === '') return;
    lastSignedIn.current = signedIn;
    void refetch();
  }, [signedIn, refetch, id]);

  usePullToRefresh(() => page.refetch());
  useShare(id && root?.shareEnabled !== false ? { route: 'page', params: { id } } : null, {
    title: root?.shareTitle || root?.title,
    imageUrl: assetUrl(root?.shareImage) ?? undefined,
  });

  const title = root?.title ?? '';
  if (id === '') {
    return (
      <PageShell title="页面">
        <Empty title="没有指定页面" />
      </PageShell>
    );
  }
  return (
    <PageShell title={title}>
      {page.isPending ? (
        <DecorSkeleton />
      ) : page.isError ? (
        <ErrorBlock error={page.error} onRetry={() => void page.refetch()} />
      ) : (
        <DecorPage page={page.data} route={{ route: 'page', params: { id } }} />
      )}
    </PageShell>
  );
}
