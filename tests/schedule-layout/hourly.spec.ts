import { test, expect, type Page } from '@playwright/test';

/**
 * The Hourly roster group, rendered by the REAL MasterScheduleGrid
 * (master-grid.html?hourly=1): a teacher with no shift assignment and no
 * availability but with booked lessons gets a row in a final "Hourly" group,
 * with no invented working hours, and every lesson is drawn at its exact
 * minute on the whole-day axis — including one before the old 08:00 start.
 */

const LABELS = {
  ltr: { hourly: 'Hourly', noWindow: 'no recorded working hours', fullTime: 'Full-time' },
  rtl: { hourly: 'بالساعة', noWindow: 'لا توجد ساعات عمل مسجلة', fullTime: 'Full-time' },
};

async function open(page: Page, dir: 'ltr' | 'rtl') {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/tests/schedule-layout/master-grid.html?dir=${dir}&hourly=1&rows=3`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('p')).some((p) => p.textContent === 'Hourly Teacher'));
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === 'Hourly Teacher')!;
    const row = label.closest('div.flex.h-full')! as HTMLElement;
    const axis = row.querySelector('div.relative.shrink-0.h-full') as HTMLElement;
    const rtl = getComputedStyle(axis).direction === 'rtl';
    const a = axis.getBoundingClientRect();
    const inlineStart = (r: DOMRect) => (rtl ? a.right - r.right : r.left - a.left);
    const slots = Array.from(axis.querySelectorAll(':scope > div.absolute.inset-0.flex > button')) as HTMLElement[];
    const columnWidth = slots[0].getBoundingClientRect().width;
    const lessons = Array.from(axis.querySelectorAll(':scope > div.absolute.top-0.h-full.z-20')).map((el) => {
      const r = el.getBoundingClientRect();
      return { start: +inlineStart(r).toFixed(2), width: +r.width.toFixed(2) };
    });
    const banners = Array.from(document.querySelectorAll('span')).map((s) => s.textContent?.trim() ?? '');
    const scroller = document.querySelector('div.overflow-auto') as HTMLElement;
    return {
      columnWidth,
      slotCount: slots.length,
      lessons,
      hatched: slots.filter((s) => s.className.includes('bg-gray-200/70')).length,
      freeBands: axis.querySelectorAll('div.bg-red-100\\/80').length,
      banners,
      scrollOffset: Math.abs(scroller.scrollLeft),
      maxScroll: scroller.scrollWidth - scroller.clientWidth,
    };
  });
}

// A real page load: index.html ships <html dir="rtl">, the saved language is
// English, and the app sets the direction itself. The grid must still open at
// 08:00 — a direction corrected only after the grid mounted used to flip the
// scroll origin under it and leave it at 00:00 (found on production 2026-10-14).
test('page load with a saved English language opens the grid at 08:00 (LTR)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jtis_lang', 'en');
    // As index.html's <html dir="rtl">: in place once parsing ends, before any
    // module script runs (the init script itself runs before <html> exists).
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'interactive') document.documentElement.setAttribute('dir', 'rtl');
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/schedule-layout/master-grid.html?dir=app&hourly=1&rows=3');
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('p')).some((p) => p.textContent === 'Hourly Teacher'));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
  const m = await measure(page);
  expect(m.scrollOffset).toBeCloseTo(Math.min(16 * m.columnWidth, m.maxScroll), 0);
});

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`hourly group (${dir})`, () => {
    test('an hourly teacher with no shift gets a row in the Hourly group, with no invented hours', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);
      expect(m.banners).toContain(LABELS[dir].hourly);
      expect(m.banners.some((b) => b.startsWith(LABELS[dir].noWindow))).toBe(true);
      // The shift group keeps its own window label.
      expect(m.banners).toContain(LABELS[dir].fullTime);
      expect(m.banners.some((b) => /2:00 PM–6:00 PM/.test(b))).toBe(true);
      // No outside-shift hatching and no "free capacity" band on a row whose hours are unknown.
      expect(m.hatched).toBe(0);
      expect(m.freeBands).toBe(0);
      expect(m.slotCount).toBe(48);
    });

    test('a teacher recorded on the hourly roster appears even with no booked lesson', async ({ page }) => {
      await open(page, dir);
      const row = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === 'Hourly Rostered Teacher');
        if (!label) return null;
        const r = label.closest('div.flex.h-full')!;
        return {
          lessons: r.querySelectorAll('div.absolute.top-0.h-full.z-20').length,
          hatched: Array.from(r.querySelectorAll('button')).filter((b) => b.className.includes('bg-gray-200/70')).length,
          freeBands: r.querySelectorAll('div.bg-red-100\\/80').length,
        };
      });
      expect(row).toEqual({ lessons: 0, hatched: 0, freeBands: 0 });
    });

    test('hourly lessons sit at their exact source minute and duration', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);
      const cw = m.columnWidth;
      const at = (minute: number) => +((minute / 30) * cw).toFixed(2);
      const starts = m.lessons.map((l) => l.start).sort((a, b) => a - b);
      // 05:45 — before the old 08:00 axis start, mid-column, never snapped.
      expect(starts[0]).toBeCloseTo(at(5 * 60 + 45), 0);
      // 14:10 for 50 minutes — exactly 50/30 of a column wide.
      const odd = m.lessons.find((l) => Math.abs(l.start - at(14 * 60 + 10)) < 1)!;
      expect(odd).toBeTruthy();
      expect(odd.width).toBeCloseTo((50 / 30) * cw, 0);
    });

    test('the grid opens at 08:00, not at the start of the axis', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);
      expect(m.scrollOffset).toBeCloseTo(Math.min(16 * m.columnWidth, m.maxScroll), 0);
    });

    test('opens at 08:00 when the grid mounts while its lessons are still loading (a real page load)', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/tests/schedule-layout/master-grid.html?dir=${dir}&hourly=1&rows=3&loadDelay=800`);
      await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('p')).some((p) => p.textContent === 'Hourly Teacher'));
      await page.waitForTimeout(300);
      const m = await measure(page);
      expect(m.scrollOffset).toBeCloseTo(Math.min(16 * m.columnWidth, m.maxScroll), 0);
    });

    test('08:00 is re-applied when the column width settles, but never over a manual scroll', async ({ page }) => {
      // Control: no user scroll — crossing a breakpoint (desktop 1280px -> 900px,
      // a different column width) re-applies 08:00 at the new width.
      await open(page, dir);
      await page.setViewportSize({ width: 900, height: 900 });
      await page.waitForTimeout(300);
      let m = await measure(page);
      expect(m.scrollOffset).toBeCloseTo(Math.min(16 * m.columnWidth, m.maxScroll), 0);

      // The user scrolls the timeline themselves, then the width changes again.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(300);
      await page.evaluate((rtl) => {
        const s = document.querySelector('div.overflow-auto') as HTMLElement;
        s.scrollLeft = rtl ? -40 : 40;
      }, dir === 'rtl');
      await page.waitForTimeout(100);
      await page.setViewportSize({ width: 900, height: 900 });
      await page.waitForTimeout(300);
      m = await measure(page);
      expect(m.scrollOffset).toBeCloseTo(40, 0);
      expect(Math.abs(m.scrollOffset - 16 * m.columnWidth)).toBeGreaterThan(m.columnWidth);
    });
  });
}
