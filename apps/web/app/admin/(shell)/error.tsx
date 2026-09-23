'use client';

import { Button, Result } from 'antd';
import { useEffect } from 'react';

/**
 * Next's own route-segment error boundary, one level above
 * `ContentBoundary` — it also catches failures in the layout's data.
 */
export default function ShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] 路由出错', error);
  }, [error]);

  return (
    <Result
      status="error"
      title="出错了"
      subTitle={error.message || '请稍后重试'}
      extra={
        <Button type="primary" onClick={reset}>
          重试
        </Button>
      }
    />
  );
}
