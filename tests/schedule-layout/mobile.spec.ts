import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile-first schedule layout.
 *
 * The regression these guard against: the grid used to fit all 24 columns
 * into whatever width it was given, so a 375px phone produced
 * (375 - 176) / 24 ≈ 8px per column, clamped to a 40px floor — a squeezed
 * desktop grid with unreadable labels. The rule now is the opposite: keep a
 * comfortable column and scroll horizontally on purpose.
 *
 * Everything is measured from the rendered DOM, in both directions.
 */

const VIEWPORTS = [
  { width: 320, height: 720, label: '320px' },
  { width: 375, height: 812, label: '375px' },
  { width: 390, height: 844, label: '390px' },
  { width: 430, height: 932, label: '430px' },
] as const;

async function openResponsive(page: Page, dir: 'ltr' | 'rtl') {
  await page.goto(`/tests/schedule-layout/index.html?dir=${dir}&responsive=1`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="row"] div.absolute.top-0.h-full.z-20').length === 4
  );
}

async function readMetrics(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="metrics"]') as HTMLElement;
    const scroller = document.querySelector('[data-testid="scroller"]') as HTMLElement;
    const row = document.querySelector('[data-testid="row"]') as HTMLElement;
    const label = row.querySelector('.sticky') as HTMLElement;
    const headerCells = Array.from(scroller.querySelectorAll('div'))
      .filter((d) => d.children.length === 0 && /^\d{1,2}:\d{2} (AM|PM)$/.test(d.textContent?.trim() ?? ''));
    const lesson = row.querySelector('div.absolute.top-0.h-full.z-20') as HTMLElement;
    const card = lesson?.querySelector('button') as HTMLElement | null;
    const studentLine = card?.querySelector('p') as HTMLElement | null;

    return {
      columnWidth: Number(el.dataset.columnWidth),
      teacherColumnWidth: Number(el.dataset.teacherColumnWidth),
      rowHeight: Number(el.dataset.rowHeight),
      isCompact: el.dataset.compact === 'true',
      direction: getComputedStyle(scroller).direction,
      // Horizontal scrolling must actually be available, not implied.
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      labelWidth: +label.getBoundingClientRect().width.toFixed(1),
      labelPosition: getComputedStyle(label).position,
      renderedRowHeight: +row.getBoundingClientRect().height.toFixed(1),
      headerCount: headerCells.length,
      headerFontPx: headerCells[0] ? parseFloat(getComputedStyle(headerCells[0]).fontSize) : 0,
      // Widest label must fit inside one column without clipping.
      widestHeaderScrollWidth: Math.max(...headerCells.map((c) => c.scrollWidth)),
      headerClientWidth: headerCells[0]?.clientWidth ?? 0,
      lessonWidth: lesson ? +lesson.getBoundingClientRect().width.toFixed(1) : 0,
      lessonHeight: lesson ? +lesson.getBoundingClientRect().height.toFixed(1) : 0,
      studentFontPx: studentLine ? parseFloat(getComputedStyle(studentLine).fontSize) : 0,
      headerPosition: getComputedStyle(scroller.querySelector('div.sticky.top-0') as HTMLElement).position,
    };
  });
}

for (const dir of ['ltr', 'rtl'] as const) {
  for (const vp of VIEWPORTS) {
    test(`dir=${dir} @ ${vp.label}: readable, touch-sized, horizontally scrollable`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openResponsive(page, dir);
      const m = await readMetrics(page);

      expect(m.direction).toBe(dir);
      expect(m.isCompact).toBe(true);

      // --- the anti-squeeze rule --------------------------------------
      // A fitted layout would give ~8px columns here. Assert the comfortable
      // band instead, and that the timeline genuinely overflows.
      expect(m.columnWidth).toBeGreaterThanOrEqual(80);
      expect(m.columnWidth).toBeLessThanOrEqual(90);
      expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);

      // --- teacher column ---------------------------------------------
      expect(m.teacherColumnWidth).toBeGreaterThanOrEqual(110);
      expect(m.teacherColumnWidth).toBeLessThanOrEqual(135);
      expect(m.labelWidth).toBeCloseTo(m.teacherColumnWidth, 0);
      expect(m.labelPosition).toBe('sticky');

      // --- time axis ----------------------------------------------------
      expect(m.headerCount).toBe(24);
      expect(m.headerFontPx).toBeGreaterThanOrEqual(11);
      // No label may be clipped by its own column.
      expect(m.widestHeaderScrollWidth).toBeLessThanOrEqual(m.headerClientWidth + 1);
      expect(m.headerPosition).toBe('sticky');

      // --- touch --------------------------------------------------------
      expect(m.rowHeight).toBeGreaterThanOrEqual(60);
      expect(m.renderedRowHeight).toBeGreaterThanOrEqual(60);
      // A 30-minute lesson card is a full column wide and a full row tall.
      expect(m.lessonWidth).toBeGreaterThanOrEqual(44);
      expect(m.lessonHeight).toBeGreaterThanOrEqual(44);
      expect(m.studentFontPx).toBeGreaterThanOrEqual(12);
    });
  }

  test(`dir=${dir}: teacher column stays frozen while the timeline scrolls on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openResponsive(page, dir);

    const read = () => page.evaluate(() => {
      const s = document.querySelector('[data-testid="scroller"]') as HTMLElement;
      const label = document.querySelector('[data-testid="row"] .sticky') as HTMLElement;
      const header = s.querySelector('div.sticky.top-0') as HTMLElement;
      return {
        scrollLeft: Math.round(Math.abs(s.scrollLeft)),
        labelLeft: +label.getBoundingClientRect().left.toFixed(1),
        headerTop: +header.getBoundingClientRect().top.toFixed(1),
      };
    });

    const start = await read();
    for (const x of [120, 400, 900, 0]) {
      await page.evaluate((target) => {
        const s = document.querySelector('[data-testid="scroller"]') as HTMLElement;
        s.scrollLeft = getComputedStyle(s).direction === 'rtl' ? -target : target;
      }, x);
      await page.waitForTimeout(40);
      const m = await read();
      expect(m.labelLeft).toBeCloseTo(start.labelLeft, 1);
      expect(m.headerTop).toBeCloseTo(start.headerTop, 1);
    }
  });
}

test('desktop keeps the fitted layout and is not forced into compact mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openResponsive(page, 'ltr');
  const m = await readMetrics(page);

  expect(m.isCompact).toBe(false);
  expect(m.teacherColumnWidth).toBe(176);
  expect(m.rowHeight).toBe(64);
  // The desktop floor rose from 40 to 48 so the widest label stops clipping.
  expect(m.columnWidth).toBeGreaterThanOrEqual(48);
  expect(m.widestHeaderScrollWidth).toBeLessThanOrEqual(m.headerClientWidth + 1);
});

test('tablet stays readable rather than compressing', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openResponsive(page, 'ltr');
  const m = await readMetrics(page);

  expect(m.columnWidth).toBeGreaterThanOrEqual(80);
  expect(m.teacherColumnWidth).toBeGreaterThanOrEqual(135);
  expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
});
