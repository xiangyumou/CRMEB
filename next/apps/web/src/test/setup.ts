import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// antd probes both of these at import time; happy-dom ships neither.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (!globalThis.scrollTo) {
  globalThis.scrollTo = (() => {}) as unknown as typeof globalThis.scrollTo;
}

// antd 6 warns about a few deprecated props from inside rc-* internals during
// tests; keep the output readable without hiding our own console noise.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Warning: [antd:')) return;
  originalWarn(...(args as []));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
