/**
 * Service worker registration for the installable (PWA) build.
 *
 * Production only. In dev we actively unregister any worker left behind by a
 * previous production build served from the same origin (localhost), so the
 * Vite dev server and HMR are never shadowed by a cached asset.
 *
 * See public/sw.js for the caching contract — in short: hashed build assets
 * only, never Supabase and never any authenticated response.
 */
export function registerServiceWorker(): void {
  // `typeof` guard: this module is also pulled in by the build-time prerender,
  // which runs in Node where neither navigator nor window exists.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((reg) => reg.unregister()))
      .catch(() => undefined);
    return;
  }

  // Registering after load keeps the worker off the critical path of the
  // first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // A failed registration must never break the app — it just means no
      // offline fallback and no asset cache for this session.
    });
  });
}
