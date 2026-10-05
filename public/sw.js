/*
 * Jawwid Teacher System — service worker.
 *
 * Deliberately minimal. Its only jobs are to make the app installable and to
 * make repeat launches fast. It is NOT an offline-data layer.
 *
 * What it caches
 *   - Vite's content-hashed build output (/assets/<name>-<hash>.js|css).
 *     The hash is part of the filename, so a cached entry can never be stale:
 *     a new deploy requests new filenames.
 *   - /offline.html, shown only when a navigation fails with no network.
 *
 * What it must never cache
 *   - Anything cross-origin. Supabase (auth tokens, profiles, lessons,
 *     attendance, messages — every private row) lives on another origin and is
 *     never touched by this worker: the fetch handler returns without calling
 *     respondWith(), so those requests go straight to the network.
 *   - Any non-GET request, any request carrying an Authorization header, and
 *     /api/*.
 *   - index.html. Navigations are always network-first so a deploy reaches
 *     every installed client on the next launch; nothing pins an old build.
 *
 * Update strategy
 *   skipWaiting() + clients.claim() means a new worker takes over immediately
 *   instead of waiting for every tab to close, so users are never stranded on
 *   an old version. The asset cache is intentionally NOT wiped on activate:
 *   a tab still running the previous build can keep resolving its old hashed
 *   chunks from the cache after the server has moved on to the next release.
 */

const VERSION = 'v1';
const ASSET_CACHE = `jawwid-assets-${VERSION}`;
const SHELL_CACHE = `jawwid-shell-${VERSION}`;
const CURRENT_CACHES = [ASSET_CACHE, SHELL_CACHE];

const OFFLINE_URL = '/offline.html';

/** Vite emits /assets/<name>-<8+ char hash>.<ext> — immutable by construction. */
const HASHED_ASSET = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp)$/;

/** Upper bound on the asset cache, so it cannot grow across deploys forever. */
const MAX_ASSET_ENTRIES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .catch(() => undefined) // a missing offline page must never block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('jawwid-') && !CURRENT_CACHES.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Trim oldest-first; Cache.keys() returns insertion order. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.status === 200 && response.type === 'basic') {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
  }
  return response;
}

async function networkOnlyWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    if (cached) return cached;
    throw new Error('offline and no offline page cached');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Everything below this line is an explicit opt-in. Any request that does
  // not match stays untouched and goes to the network as if no worker existed.
  if (request.method !== 'GET') return;
  if (request.headers.has('authorization')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (Supabase, Google Fonts, …) is never cached or intercepted.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkOnlyWithOfflineFallback(request));
    return;
  }

  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
