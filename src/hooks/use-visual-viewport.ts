import * as React from 'react';

export interface VisualViewportRect {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

/**
 * The part of the page the user can ACTUALLY see right now.
 *
 * This is not the same thing as the layout viewport, and on iOS the
 * difference is the whole problem. Opening the software keyboard does not
 * shrink the layout viewport: `window.innerHeight` and
 * `document.documentElement.clientHeight` keep reporting the full screen, and
 * a `position: fixed` element keeps being positioned against that full
 * screen — straight through the keyboard. Only `window.visualViewport`
 * reports the smaller, scrolled region that is genuinely visible.
 *
 * Floating UI's `size` middleware — which Radix Popper uses to publish
 * `--radix-popper-available-height` — measures the layout viewport, so a
 * popover sized from it is free to extend behind the keyboard. Anything that
 * must stay reachable while typing has to be positioned from the rect this
 * hook returns instead.
 *
 * `offsetTop` matters as much as `height`: iOS scrolls the visual viewport
 * within the layout viewport to reveal the focused field, and a fixed element
 * has to be pushed down by exactly that much to stay where the user is
 * looking.
 *
 * Falls back to the layout viewport wherever `visualViewport` is unavailable,
 * which keeps every non-iOS browser and the prerender pass on the same code
 * path as before.
 */
function readViewport(): VisualViewportRect {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, offsetTop: 0, offsetLeft: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
    };
  }
  return {
    width: vv.width,
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
  };
}

/**
 * Subscribes only while `enabled`, because the keyboard fires `resize` and
 * `scroll` continuously as it animates and there is no reason for every
 * closed dropdown on a page to re-render through that.
 */
export function useVisualViewport(enabled: boolean): VisualViewportRect {
  const [rect, setRect] = React.useState<VisualViewportRect>(readViewport);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      // Coalesced into a frame: iOS emits a burst of these while the keyboard
      // slides, and the panel only needs the settled value each paint.
      frame = requestAnimationFrame(() => setRect(readViewport()));
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, [enabled]);

  return rect;
}
