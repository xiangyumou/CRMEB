import { platform } from '@/platform';

/**
 * An uploaded file's URL as the page can load it. The server hands out paths relative to the
 * shop's origin (`/uploads/…`); the mini-program has no origin of its own, so it prefixes the
 * API origin. Absolute URLs and `null` pass through.
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const base = platform.api.baseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
