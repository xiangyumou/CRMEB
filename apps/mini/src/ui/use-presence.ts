import { useEffect, useState } from 'react';
import { useOverlayStore } from './overlay-store';

/** How long the exit animation runs (design.md §6: 150 ms out). */
export const EXIT_MS = 150;

/**
 * Mount / animate / unmount for an overlay: `mounted` stays true through the exit animation,
 * `shown` flips one frame after mounting so the enter transition runs. While shown, the page
 * behind stops scrolling (overlay-store).
 */
export function usePresence(visible: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  const [previous, setPrevious] = useState(visible);
  const push = useOverlayStore((state) => state.push);
  const pop = useOverlayStore((state) => state.pop);

  // Adjust state while rendering (not in an effect) when `visible` flips.
  if (previous !== visible) {
    setPrevious(visible);
    if (visible) setMounted(true);
    else setShown(false);
  }

  useEffect(() => {
    const timer = visible
      ? setTimeout(() => setShown(true), 16)
      : setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    push();
    return () => pop();
  }, [visible, push, pop]);

  return { mounted, shown };
}
