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
