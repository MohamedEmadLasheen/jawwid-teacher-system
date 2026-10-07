import { test, expect, type Page } from '@playwright/test';

/**
 * Rendered-layout tests for the midnight extension.
 *
 * The grid used to end at 20:00, so every lesson starting at or after 20:00
 * was drawn with zero width — present in the DOM-free sense of "the component
 * returned null", i.e. absent. The authoritative workbook schedules as late as
 * 21:30, and 13 imported production lessons were degraded by that boundary
 * (12 invisible, 1 drawn at half its duration).
 *
 * These assertions measure the real rendered boxes in a real browser, in both
 * text directions and at phone / tablet / desktop widths. Pure geometry
 * assertions live in scripts/schedule-geometry-tests/midnight.test.mjs; they
 * cannot catch a CSS or filtering regression, which is why this file exists.
 */

const DIRECTIONS = ['ltr', 'rtl'] as const;

/** Lessons the harness fixture renders (4 daytime + 5 late-evening). */
const LESSON_COUNT = 9;

/** The late-evening fixture lessons, in minutes-since-midnight. */
const LATE = [
  { start: 20 * 60, dur: 30, label: '8:00 PM' },
  { start: 20 * 60 + 30, dur: 30, label: '8:30 PM' },
  { start: 21 * 60, dur: 30, label: '9:00 PM' },
  { start: 21 * 60 + 30, dur: 30, label: '9:30 PM' },
  { start: 23 * 60 + 30, dur: 30, label: '11:30 PM' },
];

async function open(page: Page, dir: string, cw = 96) {
  await page.goto(`/tests/schedule-layout/index.html?dir=${dir}&cw=${cw}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="row"] div.absolute.top-0.h-full.z-20').length === n,
    LESSON_COUNT
  );
}

/** Inline-start/end of every header cell and lesson card, direction-agnostic. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="scroller"]') as HTMLElement;
    const rtl = getComputedStyle(scroller).direction === 'rtl';
    const s = scroller.getBoundingClientRect();
    const start = (el: Element) => {
      const r = el.getBoundingClientRect();
      return rtl ? +(s.right - r.right).toFixed(3) : +(r.left - s.left).toFixed(3);
    };

    // Column labels only. The terminal boundary marker matches the same text
    // shape but is deliberately NOT a column, so it is excluded here and
    // measured separately as `endLabel`.
    const endEl = scroller.querySelector('[data-testid="timeline-end-label"]');
    const headerCells: Record<string, number> = {};
    for (const d of Array.from(scroller.querySelectorAll('div'))) {
      if (d === endEl) continue;
      const t = d.textContent?.trim() ?? '';
      if (d.children.length === 0 && /^\d{1,2}:\d{2} (AM|PM)$/.test(t)) headerCells[t] = start(d);
    }

    const row = scroller.querySelector('[data-testid="row"]')!;
    const lessons = Array.from(row.querySelectorAll('div.absolute.top-0.h-full.z-20'))
      .map((el) => ({
        start: start(el),
        width: +el.getBoundingClientRect().width.toFixed(3),
        height: +el.getBoundingClientRect().height.toFixed(3),
      }))
      .sort((a, b) => a.start - b.start);

    const header = scroller.querySelector('.sticky.top-0') as HTMLElement | null;
    return {
      dir: getComputedStyle(scroller).direction,
      headerCells,
      lessons,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      maxScroll: scroller.scrollWidth - scroller.clientWidth,
      headerPosition: header ? getComputedStyle(header).position : null,
      endLabel: endEl ? (endEl.textContent ?? '').trim() : null,
      endLabelStart: endEl ? start(endEl) : null,
      endLabelWidth: endEl ? +endEl.getBoundingClientRect().width.toFixed(3) : null,
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
    };
  });
}

for (const dir of DIRECTIONS) {
  test.describe(`dir=${dir}`, () => {
    test('A. the time axis runs to midnight — 32 columns, last label 11:30 PM', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);
      expect(m.dir).toBe(dir);

      const labels = Object.keys(m.headerCells);
      expect(labels).toHaveLength(32);
      expect(labels).toContain('11:30 PM');
      // The old boundary is no longer the end of the axis: 8:00 PM is column
      // 25 of 32, so seven columns follow it (8:30 PM .. 11:30 PM).
      const after = labels.filter((l) => m.headerCells[l] > m.headerCells['8:00 PM']);
      expect(after).toHaveLength(7);
      expect(after.sort((a, b) => m.headerCells[a] - m.headerCells[b])).toEqual([
        '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM',
      ]);
      // Midnight must read as AM. A "12:00 PM" end would be noon — the exact
      // mistake the request called out.
      expect(labels).not.toContain('12:00 AM');   // not a COLUMN; see the terminal-boundary test
      expect(labels.filter((l) => l === '12:00 PM')).toHaveLength(1); // noon, mid-axis
    });

    test('B/C. 12:00 AM is the terminal boundary, not an extra schedulable column', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);

      // B. The endpoint is rendered, and reads midnight — not noon.
      expect(m.endLabel).toBe('12:00 AM');

      // C. It is NOT a column: the schedulable columns are still exactly 32,
      // the last of them 11:30 PM. There is no 12:00 AM → 12:30 AM slot.
      const labels = Object.keys(m.headerCells);
      expect(labels).toHaveLength(32);
      const last = labels.sort((a, b) => m.headerCells[a] - m.headerCells[b]).at(-1);
      expect(last).toBe('11:30 PM');

      // It sits at the closing edge of the axis — at or before it, never past.
      // (It hangs back from a zero-width anchor, so its inline-start is less
      // than the axis end by its own text width.)
      const axisEnd = m.headerCells['11:30 PM'] + 96;
      expect(m.endLabelStart).toBeLessThanOrEqual(axisEnd + 0.75);
      expect(m.endLabelStart! + m.endLabelWidth!).toBeGreaterThan(m.headerCells['11:30 PM']);

      // And it must not widen the scroll content: the anchor is zero-width, so
      // the axis is still exactly 32 columns wide.
      expect(m.docScrollWidth).toBeLessThanOrEqual(m.docClientWidth + 1);
    });

    test('H. a lesson ending exactly at midnight keeps its full width', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);

      // The 23:30-24:00 fixture ends exactly on the boundary. The old clipping
      // mechanism (clampToTimeline) must not shorten it.
      const card = m.lessons.find((c) => Math.abs(c.start - m.headerCells['11:30 PM']) < 0.75);
      expect(card, 'a lesson card must sit under 11:30 PM').toBeTruthy();
      expect(card!.width).toBeCloseTo(96, 1);
    });

    test('B-E. every late lesson is rendered at its exact minute and full width', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);

      // All nine cards exist — nothing is filtered out.
      expect(m.lessons).toHaveLength(LESSON_COUNT);

      for (const l of LATE) {
        const expectedStart = m.headerCells[l.label];
        expect(expectedStart, `header cell ${l.label} must exist`).toBeDefined();

        const card = m.lessons.find((c) => Math.abs(c.start - expectedStart) < 0.75);
        expect(card, `a lesson card must sit under ${l.label}`).toBeTruthy();

        // F/G. Exact duration — a 30-min lesson is exactly one column, never
        // clipped to zero and never rounded up.
        expect(card!.width).toBeCloseTo(96, 1);
        expect(card!.width).toBeGreaterThan(0);
        expect(card!.height).toBeGreaterThan(0);
      }
    });

    test('H. no lesson is hidden by the old 20:00 boundary', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);

      const boundary = m.headerCells['8:00 PM'];
      const past = m.lessons.filter((c) => c.start >= boundary - 0.75);
      // Five fixture lessons start at or after 20:00; under the old grid this
      // was zero.
      expect(past).toHaveLength(5);
      for (const c of past) expect(c.width).toBeGreaterThan(0);
    });

    test('K-L. daytime lessons are unchanged', async ({ page }) => {
      await open(page, dir);
      const m = await measure(page);

      // 12:00, 15:30, 16:00 (40 min) and 18:30 keep their exact geometry.
      const at = (label: string) =>
        m.lessons.find((c) => Math.abs(c.start - m.headerCells[label]) < 0.75);

      expect(at('12:00 PM')!.width).toBeCloseTo(96, 1);
      expect(at('3:30 PM')!.width).toBeCloseTo(96, 1);
      // The 40-minute lesson stays 40/30 of a column — not snapped to two.
      expect(at('4:00 PM')!.width).toBeCloseTo(128, 1);
      expect(at('6:30 PM')!.width).toBeCloseTo(96, 1);
      // 08:00 is still the first column on the axis. (Offsets are measured
      // from the scroller's inline-start edge, which includes the frozen
      // label column, so the origin is that column's width, not 0.)
      const minOffset = Math.min(...Object.values(m.headerCells));
      expect(m.headerCells['8:00 AM']).toBeCloseTo(minOffset, 1);
    });

    test('J. sticky header survives the longer axis and the page does not overflow', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await open(page, dir);
      const m = await measure(page);

      expect(m.headerPosition).toBe('sticky');
      // The timeline scrolls inside its own container...
      expect(m.maxScroll).toBeGreaterThan(0);
      // ...and must NOT push the document itself sideways.
      expect(m.docScrollWidth).toBeLessThanOrEqual(m.docClientWidth + 1);
    });
  });
}

// --- I. mobile: the late evening must be reachable by scrolling ------------
for (const dir of DIRECTIONS) {
  for (const vp of [{ w: 375, label: '375px' }, { w: 390, label: '390px' }, { w: 768, label: '768px' }]) {
    test(`I. dir=${dir} @ ${vp.label}: can scroll to the 11:30 PM column`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: 800 });
      await open(page, dir);

      const before = await measure(page);
      expect(before.lessons).toHaveLength(LESSON_COUNT);
      // The axis is wider than the phone, on purpose — columns stay readable
      // and the user scrolls.
      expect(before.maxScroll).toBeGreaterThan(0);

      // Scroll to the far end of the timeline and confirm the last column and
      // the 23:30 lesson are really there.
      await page.evaluate(() => {
        const s = document.querySelector('[data-testid="scroller"]') as HTMLElement;
        s.scrollLeft = s.scrollWidth; // clamped by the browser in both directions
      });
      const end = await measure(page);
      expect(Object.keys(end.headerCells)).toContain('11:30 PM');
      expect(end.lessons).toHaveLength(LESSON_COUNT);

      // The 23:30 card is the last one on the axis and still full width.
      const last = end.lessons[end.lessons.length - 1];
      expect(last.width).toBeCloseTo(96, 1);

      // No vertical clipping of the row, and no document-level overflow.
      expect(last.height).toBeGreaterThan(0);
      expect(end.docScrollWidth).toBeLessThanOrEqual(end.docClientWidth + 1);
    });
  }
}
