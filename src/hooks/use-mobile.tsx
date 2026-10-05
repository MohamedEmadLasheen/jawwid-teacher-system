import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Resolved during render, not after it.
 *
 * The previous version started at `undefined` and only learned the answer in
 * an effect, so EVERY consumer rendered once as "desktop" before correcting
 * itself. For a layout that is merely a flash; for anything that decides
 * whether to *mount* a desktop-only behaviour it is a real window in which
 * that behaviour exists on a phone — LessonCell mounted the hover preview for
 * that render, and MasterSchedulePage would have routed a tap arriving inside
 * it to the desktop dialog instead of Quick Actions.
 *
 * Guarded for the prerender pass (`npm run build` prerenders / and /blog/),
 * where there is no window; those pages re-render on the client anyway.
 */
function matchesMobile(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile() {
  // Lazy initializer: evaluated on the first render, so the first render is
  // already correct.
  const [isMobile, setIsMobile] = React.useState<boolean>(matchesMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    // Re-read once on mount in case the viewport changed between the first
    // render and this effect.
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
