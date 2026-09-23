import Link from 'next/link';

/**
 * The H5 storefront is served by the edge container, not by Next, so `/` is
 * only ever hit by someone poking at the origin directly.
 */
export default function RootPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>商城服务</h1>
        <p style={{ color: '#888' }}>
          管理后台在 <Link href="/admin">/admin</Link>
        </p>
      </div>
    </main>
  );
}
