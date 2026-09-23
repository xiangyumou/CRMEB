import type { LinkTarget } from '@shop/contracts/decor/link';
import { linkTargetRoute } from '@shop/contracts/decor/link-route';
import { navigate, openExternalLink, openMiniProgram } from '@/platform';

/**
 * Opens a DIY `LinkTarget` (docs/mini/pages.md §3): catalogue kinds through the route catalogue,
 * `webview` through the C12 host check, `miniprogram` through WeChat.
 */
export function openLinkTarget(link: LinkTarget): void {
  if (link.kind === 'webview') return void openExternalLink(link.url);
  if (link.kind === 'miniprogram') return openMiniProgram(link.appId, link.path);
  const route = linkTargetRoute(link);
  if (route) void navigate(route);
}
