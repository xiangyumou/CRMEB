import Link from 'next/link';

/**
 * Every URL nothing serves, outside the admin shell (which has its own).
 *
 * Next's default is an English page; this one says the same in Chinese and
 * offers the way back. Plain markup rather than antd: it renders under the
 * root layout, without the admin providers.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
        color: '#333',
      }}
    >
      <h1 style={{ fontSize: 48, margin: 0, color: '#999' }}>404</h1>
      <p style={{ margin: 0 }}>你访问的页面不存在</p>
      <Link href="/admin" style={{ color: '#1677ff' }}>
        返回管理后台
      </Link>
    </main>
  );
}
