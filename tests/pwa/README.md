# PWA / installability tests

Verifies that the production build is actually installable, and — more
importantly — that the service worker stays conservative.

```bash
npx playwright test --config tests/pwa/playwright.config.ts
```

The config builds the app and serves `dist/` with `vite preview`, so every
assertion runs against the real artefact that gets rsynced to the VPS, over
`http://localhost` (a secure context, which a service worker requires).

## What they assert

| Group | Coverage |
|---|---|
| Manifest | linked from the document, valid JSON, `id` / `start_url` / `scope` / `display: standalone`, theme and background colours, `lang`/`dir` |
| Icons | 192 + 512 in both `any` and `maskable`; each file is fetched, confirmed `image/png`, and its **real pixel size decoded from the PNG header** must match the size the manifest declares, and be square |
| iOS metadata | `viewport-fit=cover`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, status-bar style, Home Screen title, and that `apple-touch-icon.png` is a genuine 180×180 PNG |
| Service worker | registers, reaches `activated`, controls scope `/` |
| Cache safety | every cached URL is same-origin **and** on the allowlist (content-hashed `/assets/*` or `/offline.html`); `index.html` is never cached |
| Offline | a navigation made offline renders the offline page, never a stale app shell |
| Routing | `/`, `/login`, `/dashboard`, `/schedule/teacher` all resolve to the SPA, so `start_url` and `scope` hold on a deep link or refresh |
| Safe areas | the new `.app-viewport` utilities are byte-identical to the `h-screen` they replaced wherever insets are 0; every arbitrary-value inset class survived the Tailwind build; the login screen stays inside simulated iPhone insets |
| Responsive | no horizontal overflow at 320 / 360 / 375 / 390 / 393 / 430 px |

## Why the cache assertions matter most

Supabase holds every private row in this system — profiles, lessons,
attendance, deductions, messages — plus the auth tokens. A service worker is
the one place where a careless `cache.put()` would write that onto the device
where any later visitor to the same browser profile could read it back. The
worker therefore only ever opts **in**, and the suite asserts the resulting
cache contents rather than trusting the code.

## Guarding against vacuous tests

Validated by sabotage: the worker was temporarily changed to serve navigations
cache-first out of the shell cache — the single most common PWA mistake, and
the one that strands users on an old build. Both the cache-allowlist test and
the offline-fallback test failed; they were green again the moment the worker
was restored.

## No authentication here

The suite signs nobody in. `playwright.config.ts` passes a placeholder Supabase
URL purely so the bundle boots far enough to inspect the manifest and the
worker. Nothing in this directory demonstrates that login, scheduling or any
other feature works — those are covered by the app's own suites and by manual
verification on a real device.
