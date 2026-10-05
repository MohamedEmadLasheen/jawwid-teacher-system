# Deployment

The app is a static SPA (Vite build) served by **nginx** on a VPS, talking to a
hosted **Supabase** backend. Deploys are automated via **GitHub Actions** using
an **atomic-release** model (timestamped folders + a `current` symlink), which
gives instant rollback.

## Production

- **URL:** https://teachers.jawwid.com
- **Server path:** `/var/www/teachers.jawwid.com`
- **Deploy user:** `deploy` (scoped to the site folder only, no sudo)
- **Supabase project ref:** `wjpnkvagwayzwpwrbqyr`

```
/var/www/teachers.jawwid.com/
├── releases/
│   ├── 20260621_1430/      # previous releases (last 5 kept)
│   └── 20260621_1612/      # newest
└── current -> releases/20260621_1612    # nginx root points here
```

## How a deploy works

1. Push to `main` (or run the workflow manually from the **Actions** tab).
2. GitHub Actions runs `npm ci` + `npm run build` with the `VITE_*` secrets.
3. The built `dist/` is rsynced into a new `releases/<timestamp>/` folder.
4. The `current` symlink is flipped to the new release (atomic — users never
   see a half-copied site). The 5 newest releases are kept; older ones pruned.

No nginx reload is needed — it follows the symlink on the next request.

## Required GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://wjpnkvagwayzwpwrbqyr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `SSH_PRIVATE_KEY` | private half of the `deploy` user's SSH key |
| `SSH_HOST` | `153.92.223.121` |
| `SSH_USER` | `deploy` |
| `DEPLOY_PATH` | `/var/www/teachers.jawwid.com` (base — **not** `/dist`) |

## Rollback (instant, no rebuild)

On the server, list releases and repoint `current` at a previous one:

```bash
ls -1dt /var/www/teachers.jawwid.com/releases/*/        # newest first
ln -sfn /var/www/teachers.jawwid.com/releases/<TIMESTAMP> \
  /var/www/teachers.jawwid.com/current
```

The change takes effect on the next request. You can flip between any of the
last 5 releases in one second.

## nginx vhost

`/etc/nginx/sites-available/teachers.jawwid.com` — `root` points at the
`current` symlink, with an SPA fallback (`try_files ... /index.html`) so deep
links and refreshes work. TLS is managed by certbot (auto-renewing).

## One-time server setup (already done)

1. `deploy` user created; CI public key in `/home/deploy/.ssh/authorized_keys`.
2. Site folders created under `/var/www/teachers.jawwid.com`.
3. nginx vhost enabled + `certbot --nginx -d teachers.jawwid.com`.
4. Supabase → Authentication → URL Configuration: Site URL +
   `https://teachers.jawwid.com/**` added to Redirect URLs.

## Installable app (PWA)

The site is installable on phones: **iPhone** via Safari → Share → *Add to Home
Screen*, **Android** via Chrome → *Install app*. Launched from the icon it runs
in `standalone` display mode — no browser chrome, its own task-switcher entry.

Everything it needs ships as static files in `dist/`, so the existing rsync
deploy covers it. nginx's `try_files` serves the real file before the SPA
fallback, so `/manifest.json`, `/sw.js` and `/offline.html` resolve correctly
with no vhost change. HTTPS (certbot) already satisfies the secure-context
requirement for the service worker.

| File | Role |
| --- | --- |
| `public/manifest.json` | name, `start_url: /`, `scope: /`, `display: standalone`, theme/background `#0E5A6B`, icons |
| `public/icons/` | 192 + 512 in `any` and `maskable`, generated from `public/assets/jawwid-logo.jpg` |
| `public/apple-touch-icon.png` | 180×180 Home Screen icon for iOS |
| `public/sw.js` | the service worker |
| `public/offline.html` | shown only when a navigation fails with no network |

### What the service worker caches — and what it must never cache

It caches **only** Vite's content-hashed build output (`/assets/<name>-<hash>.js|css`)
plus the offline page. The hash is in the filename, so a cached entry can never
be stale.

It never touches anything else. Cross-origin requests return from the fetch
handler untouched, which means **every Supabase response — auth tokens,
profiles, lessons, attendance, deductions, messages — goes straight to the
network and is never written to a cache on the device.** Non-GET requests,
anything carrying an `Authorization` header, and `/api/*` are excluded too.
`tests/pwa` asserts the actual cache contents on every run; keep it that way.

`index.html` is deliberately **not** cached. Navigations are network-first with
the offline page as the only fallback. The app shell is never served offline on
purpose: offline it cannot reach Supabase to resolve the session, and the
existing `initialize()` path signs the user out when the profile lookup fails.

### How updates reach installed apps

`skipWaiting()` + `clients.claim()`, so a new worker takes over on the next
launch rather than waiting for every tab to close. Because `index.html` always
comes from the network, a deploy is picked up immediately — the new HTML
references new hashed filenames and those are fetched fresh. There is no
version to bump by hand and no way for a user to get stranded on an old build.

The asset cache is intentionally *not* wiped on activate: a tab still running
the previous release can keep resolving its old chunks from cache after the
server has moved on. It is capped at 120 entries, oldest evicted first.

### Disabling the worker

If it ever needs to be switched off in production, replace `public/sw.js` with
a worker that unregisters itself and deploy:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  await self.registration.unregister();
  for (const key of await caches.keys()) await caches.delete(key);
  for (const client of await self.clients.matchAll()) client.navigate(client.url);
});
```

Browsers bypass the HTTP cache when checking `sw.js`, so installed clients pick
this up on their next launch. Also remove the `registerServiceWorker()` call in
`src/main.tsx`.

### Manual device checklist

Automated checks cover the manifest, icons, worker, caching, routing and
responsive layout (`npx playwright test --config tests/pwa/playwright.config.ts`).
The following need a real handset and a real teacher account:

**iPhone (Safari)**
- [ ] Share → *Add to Home Screen* offers the Jawwid icon and the name "جوِّد"
- [ ] Launching from the icon opens with no Safari address bar or toolbar
- [ ] The teal header sits directly below the status bar; status-bar text is white and legible
- [ ] The footer clears the home indicator; nothing is cut off at the bottom
- [ ] Log in, force-quit the app, relaunch — still signed in
- [ ] Rotate to landscape: no content under the notch
- [ ] Focus a text field: the keyboard does not cover the field being typed in
- [ ] Open a deep link (e.g. a `/teachers/<id>` URL) and refresh
- [ ] Turn on Airplane Mode and relaunch: the offline page appears, not a blank screen
- [ ] Reconnect and reload: the app loads normally and the session survives
- [ ] Log out, then log back in

**Android (Chrome)**
- [ ] Chrome menu offers *Install app* (not just "Add to Home screen" shortcut)
- [ ] The launcher icon is the maskable Jawwid icon, correctly shaped — not a white box
- [ ] Launching opens standalone with the splash using `#0E5A6B`
- [ ] Hardware back button navigates within the app rather than closing it
- [ ] Log in, close from recents, relaunch — still signed in
- [ ] Deploy a new release, relaunch the installed app — the new version loads
- [ ] Uninstall and reinstall: no stale data, login still works

### Physical-device acceptance

Everything automated is covered by `tests/pwa` (manifest, icons, worker, cache
allowlist, offline fallback, routing, safe areas, keyboard zoom). The steps
below need a real handset and a real Teacher account, and are the only
remaining acceptance items. The project has no QA or staging account, so these
must be run by someone who can sign in.

**iPhone — Safari**
1. Open `https://teachers.jawwid.com` in Safari.
2. Log in with a real Teacher account.
3. Confirm the authenticated Teacher System works normally.
4. Share → *Add to Home Screen*.
5. Confirm the correct Jawwid icon appears.
6. Launch it from the Home Screen.
7. Confirm it opens standalone, with no Safari address bar or toolbar.
8. Confirm the session is still valid (no re-login).
9. Navigate through the main Teacher System screens.
10. Test scrolling.
11. Test forms.
12. Test text inputs and textarea focus (the view must not zoom in).
13. Test keyboard behaviour — the focused field stays visible.
14. Confirm the home-indicator area does not cover the footer or any control.
15. Confirm the status bar does not overlap the header.
16. Close and reopen the PWA.
17. Confirm the session is still valid.
18. Log out.
19. Confirm logout works.
20. Log in again.

**Android — Chrome**
1. Open the production URL.
2. Log in with a real Teacher account.
3. Confirm the authenticated Teacher System works.
4. Chrome menu → *Install app*.
5. Confirm the correct icon in the launcher.
6. Launch from the installed app.
7. Confirm standalone behaviour.
8. Confirm the session persists.
9. Test navigation.
10. Test forms.
11. Test keyboard.
12. Test scrolling.
13. Test hardware back navigation.
14. Close and reopen.
15. Confirm the session persists.
16. Log out.
17. Log in again.
