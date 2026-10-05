import { test, expect, type Page } from '@playwright/test';

/**
 * Installability and service-worker safety checks for the Jawwid Teacher
 * System, run against the real `npm run build` output served by `vite preview`
 * (see playwright.config.ts). These assert the things a browser actually looks
 * at before it offers "Install" / "Add to Home Screen", plus the caching
 * contract documented in public/sw.js — above all, that no authenticated or
 * cross-origin response is ever written to a cache.
 *
 * No account is signed in anywhere in this file. Nothing here proves that
 * login works; it proves the PWA layer is present, correct and conservative.
 */

/** Width/height out of a PNG's IHDR chunk — bytes 16..24, big-endian. */
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Resolves once the page controls an activated worker. */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active && navigator.serviceWorker.controller);
    },
    undefined,
    { timeout: 20_000 }
  );
}

test.describe('manifest', () => {
  test('is linked from the document and serves valid JSON', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBe('/manifest.json');

    const res = await request.get('/manifest.json');
    expect(res.status()).toBe(200);
    const manifest = JSON.parse(await res.text());

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0E5A6B');
    expect(manifest.background_color).toBe('#0E5A6B');
    expect(manifest.lang).toBe('ar');
    expect(manifest.dir).toBe('rtl');
  });

  test('declares the icon sizes browsers require, and the files match', async ({ request }) => {
    const manifest = JSON.parse(await (await request.get('/manifest.json')).text());
    const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = manifest.icons;

    const key = (i: { sizes: string; purpose: string }) => `${i.purpose}:${i.sizes}`;
    const declared = icons.map(key).sort();
    // Chrome needs 192 and 512 "any"; a maskable pair is what keeps the
    // Android launcher from framing the icon in a white box.
    expect(declared).toEqual(['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']);

    for (const icon of icons) {
      const res = await request.get(icon.src);
      expect(res.status(), `${icon.src} must be served`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');

      const [declaredW, declaredH] = icon.sizes.split('x').map(Number);
      const actual = pngSize(await res.body());
      expect(actual, `${icon.src} must really be ${icon.sizes}`).toEqual({
        width: declaredW,
        height: declaredH,
      });
      expect(actual.width, 'icons must be square').toBe(actual.height);
    }
  });
});

test.describe('iOS Home Screen metadata', () => {
  test('document carries the standalone + safe-area meta iOS reads', async ({ page }) => {
    await page.goto('/');

    const content = (name: string) => page.getAttribute(`meta[name="${name}"]`, 'content');

    expect(await content('viewport')).toContain('viewport-fit=cover');
    expect(await content('mobile-web-app-capable')).toBe('yes');
    expect(await content('apple-mobile-web-app-capable')).toBe('yes');
    expect(await content('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
    expect(await content('apple-mobile-web-app-title')).toBeTruthy();
    expect(await content('theme-color')).toBe('#0E5A6B');
  });

  test('apple-touch-icon is a real square PNG, not a renamed JPEG', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect(href).toBe('/apple-touch-icon.png');

    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    expect(pngSize(await res.body())).toEqual({ width: 180, height: 180 });
  });
});

test.describe('service worker', () => {
  test('registers, activates and controls the whole origin', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { scope: reg!.scope, state: reg!.active!.state, script: reg!.active!.scriptURL };
    });

    expect(info.state).toBe('activated');
    expect(new URL(info.scope).pathname).toBe('/');
    expect(new URL(info.script).pathname).toBe('/sw.js');
  });

  test('caches only content-hashed build assets — never HTML, never private data', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    // Second load: the worker is now controlling, so this is the pass that
    // actually populates the cache.
    await page.reload();
    await waitForServiceWorker(page);
    await page.waitForLoadState('networkidle');

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const out: Record<string, string[]> = {};
      for (const name of names) {
        const cache = await caches.open(name);
        out[name] = (await cache.keys()).map((r) => r.url);
      }
      return out;
    });

    const allUrls = Object.values(cached).flat();
    expect(allUrls.length, 'the worker should have cached something').toBeGreaterThan(0);

    const origin = new URL(page.url()).origin;
    const hashedAsset = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp)$/;

    for (const url of allUrls) {
      // Nothing cross-origin: Supabase holds every private row and every auth
      // token, and it must never be readable out of a cache on the device.
      expect(url.startsWith(origin), `${url} must be same-origin`).toBe(true);

      const { pathname } = new URL(url);
      const allowed = hashedAsset.test(pathname) || pathname === '/offline.html';
      expect(allowed, `${pathname} is not on the cache allowlist`).toBe(true);
    }

    // index.html specifically must stay network-first, or a deploy would never
    // reach an installed app.
    expect(allUrls.some((u) => new URL(u).pathname === '/')).toBe(false);
    expect(allUrls.some((u) => new URL(u).pathname.endsWith('index.html'))).toBe(false);
  });

  test('a navigation made offline falls back to the offline page, not a stale app shell', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    await page.waitForLoadState('networkidle');

    await context.setOffline(true);
    try {
      await page.goto('/dashboard');
      await expect(page.locator('body')).toContainText('لا يوجد اتصال');
      // The app shell must not render offline: it would try to resolve the
      // Supabase session, fail, and sign the teacher out.
      await expect(page.locator('#root')).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('routing', () => {
  test('deep links and refreshes resolve to the SPA, so start_url and scope hold', async ({ page }) => {
    for (const path of ['/', '/login', '/dashboard', '/schedule/teacher']) {
      const res = await page.goto(path);
      expect(res!.status(), `${path} should be served`).toBe(200);
      await expect(page.locator('#root')).toHaveCount(1);
    }
  });
});

test.describe('mobile viewport & safe areas', () => {
  test('the safe-area utilities are a no-op wherever insets are 0', async ({ page }) => {
    await page.goto('/');

    // Every browser tab, every desktop, all of Android: env() is 0, so the new
    // utilities must produce exactly the box h-screen / min-h-screen produced
    // before. This is the desktop no-regression guard for the CSS change.
    const boxes = await page.evaluate(() => {
      const mk = (cls: string, style: string) => {
        const d = document.createElement('div');
        d.className = cls;
        d.style.cssText = style;
        document.body.appendChild(d);
        const s = getComputedStyle(d);
        const out = {
          h: d.getBoundingClientRect().height,
          pt: s.paddingTop,
          pb: s.paddingBottom,
          pl: s.paddingLeft,
          pr: s.paddingRight,
        };
        d.remove();
        return out;
      };
      return {
        appViewport: mk('app-viewport', ''),
        hScreen: mk('', 'height:100vh'),
        appViewportMin: mk('app-viewport-min', ''),
        minHScreen: mk('', 'min-height:100vh'),
        // The footer's inset padding must not change the 8px py-2 gives today.
        footer: mk('py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]', ''),
        plainPy2: mk('py-2', ''),
      };
    });

    expect(boxes.appViewport).toEqual(boxes.hScreen);
    expect(boxes.appViewportMin).toEqual(boxes.minHScreen);
    expect(boxes.footer.pb).toBe(boxes.plainPy2.pb);
  });

  test('every safe-area rule the layout depends on survived the Tailwind build', async ({ page }) => {
    await page.goto('/');

    // These are Tailwind arbitrary values — they only reach the stylesheet if
    // the JIT scanner found them in source. A refactor that renames a class
    // would silently drop the inset and the notch would eat the UI.
    const rules = await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules];
          } catch {
            return [];
          }
        })
        .map((r) => r.cssText)
        .filter((t) => t.includes('safe-area-inset'))
    );

    const has = (needle: string) => rules.some((r) => r.includes(needle));
    expect(has('.app-viewport {'), '.app-viewport').toBe(true);
    expect(has('.app-viewport-min {'), '.app-viewport-min').toBe(true);
    expect(has('padding-top: env(safe-area-inset-top)'), 'drawer top inset').toBe(true);
    expect(has('padding-bottom: env(safe-area-inset-bottom)'), 'drawer bottom inset').toBe(true);
    expect(has('calc(.5rem + env(safe-area-inset-bottom))'), 'footer home-indicator inset').toBe(true);
    expect(has('calc(1rem + env(safe-area-inset-top))'), 'login language button inset').toBe(true);
  });

  test('the login screen stays inside a simulated iPhone safe area', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.locator('form')).toBeVisible();

    // env() is always 0 in a browser tab, so stand in concrete iPhone 14 Pro
    // insets and check the real login markup reacts correctly.
    const measured = await page.evaluate(() => {
      const STATUS_BAR = 59;
      const HOME_INDICATOR = 34;
      const root = document.querySelector('.app-viewport-min') as HTMLElement;
      const form = document.querySelector('form') as HTMLElement;

      const style = document.createElement('style');
      style.textContent = `.app-viewport-min{padding-top:${STATUS_BAR}px;padding-bottom:${HOME_INDICATOR}px}`;
      document.head.appendChild(style);
      void root.offsetHeight;

      const out = {
        statusBar: STATUS_BAR,
        rootHeight: root.getBoundingClientRect().height,
        viewportHeight: window.innerHeight,
        formTop: form.getBoundingClientRect().top,
        formBottom: form.getBoundingClientRect().bottom,
        homeIndicatorTop: window.innerHeight - HOME_INDICATOR,
      };
      style.remove();
      return out;
    });

    // Content clears the status bar and the home indicator, and the screen is
    // not pushed taller than the viewport by the padding.
    expect(measured.formTop).toBeGreaterThanOrEqual(measured.statusBar);
    expect(measured.formBottom).toBeLessThanOrEqual(measured.homeIndicatorTop);
    expect(measured.rootHeight).toBe(measured.viewportHeight);
  });

  test('no horizontal overflow at any supported phone width', async ({ page }) => {
    for (const width of [320, 360, 375, 390, 393, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/login');
      await expect(page.locator('form')).toBeVisible();
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth, `${width}px must not scroll sideways`).toBeLessThanOrEqual(
        overflow.innerWidth
      );
    }
  });
});

test.describe('iOS keyboard zoom', () => {
  // iOS Safari zooms the whole viewport when a focused field renders below
  // 16px. In a browser tab that is merely annoying; in a standalone PWA there
  // is no address bar to pinch back from, so the app stays zoomed in. Every
  // text-entry primitive therefore has to be >= 16px under the md breakpoint
  // and may only drop to 14px at >= 768px, where no mobile keyboard exists.
  const TEXTAREA_CLASS =
    'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

  async function fontSizes(page: import('@playwright/test').Page, textareaClass: string) {
    return page.evaluate((cls) => {
      const ta = document.createElement('textarea');
      ta.className = cls;
      document.body.appendChild(ta);
      const taSize = parseFloat(getComputedStyle(ta).fontSize);
      ta.remove();
      const input = document.querySelector('#email') as HTMLElement;
      return { textarea: taSize, input: parseFloat(getComputedStyle(input).fontSize) };
    }, textareaClass);
  }

  test('text fields are at least 16px on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();

    const sizes = await fontSizes(page, TEXTAREA_CLASS);
    expect(sizes.input, 'Input must not trigger iOS zoom').toBeGreaterThanOrEqual(16);
    expect(sizes.textarea, 'Textarea must not trigger iOS zoom').toBeGreaterThanOrEqual(16);
  });

  test('desktop keeps the 14px fields it has always had', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();

    const sizes = await fontSizes(page, TEXTAREA_CLASS);
    expect(sizes.input).toBe(14);
    expect(sizes.textarea).toBe(14);

    // And prove it against the exact class string the Textarea carried before
    // this change: on desktop the two must be indistinguishable.
    const legacy = await page.evaluate(() => {
      const old =
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
      const t = document.createElement('textarea');
      t.className = old;
      t.rows = 3;
      document.body.appendChild(t);
      const s = getComputedStyle(t);
      const out = { fontSize: s.fontSize, lineHeight: s.lineHeight, height: t.getBoundingClientRect().height };
      t.remove();
      return out;
    });
    const current = await page.evaluate((cls) => {
      const t = document.createElement('textarea');
      t.className = cls;
      t.rows = 3;
      document.body.appendChild(t);
      const s = getComputedStyle(t);
      const out = { fontSize: s.fontSize, lineHeight: s.lineHeight, height: t.getBoundingClientRect().height };
      t.remove();
      return out;
    }, TEXTAREA_CLASS);

    expect(current).toEqual(legacy);
  });
});
