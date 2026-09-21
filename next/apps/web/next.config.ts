import type { NextConfig } from 'next';

/**
 * The admin UI and both API surfaces ship as one standalone Next server.
 * `@shop/contracts` is published as TypeScript source (see its package.json
 * `exports`), so it has to be transpiled by Next rather than consumed as JS.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@shop/contracts'],
  reactStrictMode: true,
  poweredByHeader: false,
  // The workspace root is `next/`, not `apps/web`; tell Next so the standalone
  // trace picks up the pnpm virtual store correctly.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  // `next dev` otherwise writes AGENTS.md / CLAUDE.md into this package. The
  // rewrite's conventions live in docs/rewrite/, and an unexpected CLAUDE.md
  // inside a worktree would compete with them.
  agentRules: false,
  typescript: {
    // `pnpm --filter @shop/web typecheck` is the gate; don't pay for it twice.
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons'],
  },
};

export default nextConfig;
