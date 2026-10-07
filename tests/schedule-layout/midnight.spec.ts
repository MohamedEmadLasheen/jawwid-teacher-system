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

// ===========================================================================
// REGRESSION: "11:30 PM" and "12:00 AM" sit SIDE BY SIDE on one header row.
//
// Two earlier attempts failed here. The first shared the final column's label
// box and overlapped by up to 38px. The second moved the marker to its own
// baseline below the labels — no overlap, but stacked, which is not the
// design. The terminal cell is now a sibling flex item of the axis box: same
// row, one column wide, immediately after 11:30 PM, and outside every
// geometry calculation.
//
// These assertions measure real DOM rectangles. A screenshot cannot prove the
// text boxes are disjoint, and a cell-box check already fooled this suite once.
// ===========================================================================
const QA_WIDTHS = [320, 375, 390, 430, 768, 1280];

async function terminalGeometry(page: Page) {
  return page.evaluate(() => {
    const s = document.querySelector('[data-testid="scroller"]') as HTMLElement;
    const end = s.querySelector('[data-testid="timeline-end-label"]') as HTMLElement | null;
    if (!end) return null;
    const cols = Array.from(s.querySelectorAll('div')).filter(
      (d) => d !== end && d.children.length === 0 && /^\d{1,2}:\d{2} (AM|PM)$/.test(d.textContent?.trim() ?? '')
    );
    const last = cols[cols.length - 1] as HTMLElement;
    const rtl = getComputedStyle(s).direction === 'rtl';

    // Text rectangles, not padded cell boxes — the glyphs are what collide.
    const tr = document.createRange(); tr.selectNodeContents(last);
    const t = tr.getBoundingClientRect();
    const er = document.createRange(); er.selectNodeContents(end);
    const e = er.getBoundingClientRect();

    const lb = last.getBoundingClientRect();
    const eb = end.getBoundingClientRect();
    const overlapX = Math.max(0, Math.min(t.right, e.right) - Math.max(t.left, e.left));
    const overlapY = Math.max(0, Math.min(t.bottom, e.bottom) - Math.max(t.top, e.top));
    const bodyAxis = s.querySelector('[data-testid="row"] .relative.shrink-0.h-full') as HTMLElement | null;

    return {
      lastLabel: last.textContent!.trim(),
      endLabel: end.textContent!.trim(),
      columnCount: cols.length,
      columnWidth: Math.round(lb.width),
      terminalWidth: Math.round(eb.width),
      intersects: overlapX > 0 && overlapY > 0,
      centreDeltaY: +Math.abs((t.top + t.bottom) / 2 - (e.top + e.bottom) / 2).toFixed(2),
      // Immediately after the final column, in whichever direction applies.
      adjacent: rtl ? Math.abs(eb.right - lb.left) < 2 : Math.abs(eb.left - lb.right) < 2,
      pointerEvents: getComputedStyle(end).pointerEvents,
      bodyAxisWidth: bodyAxis ? Math.round(bodyAxis.getBoundingClientRect().width) : null,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const dir of DIRECTIONS) {
  for (const width of QA_WIDTHS) {
    test(`terminal cell: dir=${dir} @ ${width}px — side by side with 11:30 PM`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tests/schedule-layout/index.html?dir=${dir}&responsive=1`);
      await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
      await page.waitForTimeout(250);

      const m = await terminalGeometry(page);
      expect(m, 'the terminal cell must exist').not.toBeNull();

      // 1. both labels present
      expect(m!.lastLabel).toBe('11:30 PM');
      expect(m!.endLabel).toBe('12:00 AM');

      // 2. text boxes disjoint
      expect(m!.intersects).toBe(false);

      // 3. SAME ROW — vertical centres aligned (this is what rules out the
      //    earlier stacked layout, which passed the overlap check)
      expect(m!.centreDeltaY).toBeLessThanOrEqual(1.5);

      // 4. immediately after the final column, mirrored correctly in RTL
      expect(m!.adjacent).toBe(true);

      // 5. exactly one column wide
      expect(m!.terminalWidth).toBe(m!.columnWidth);

      // 6/7. the schedulable axis is untouched by the header's extra cell
      expect(m!.columnCount).toBe(32);
      // 15. lesson geometry unchanged: the body is still 32 columns wide
      expect(m!.bodyAxisWidth).toBe(32 * m!.columnWidth);

      // 9. it can never be clicked as a slot
      expect(m!.pointerEvents).toBe('none');

      // 14. no page-level horizontal overflow
      expect(m!.docOverflow).toBeLessThanOrEqual(1);
    });
  }
}

test('the terminal cell is not a schedulable column', async ({ page }) => {
  await open(page, 'ltr');
  const m = await measure(page);
  const labels = Object.keys(m.headerCells);

  // 7. no 12:00 AM among the schedulable columns
  expect(labels).not.toContain('12:00 AM');
  expect(labels).toHaveLength(32);

  // 3. 11:30 PM is still the final real slot
  const sorted = labels.sort((a, b) => m.headerCells[a] - m.headerCells[b]);
  expect(sorted.at(-1)).toBe('11:30 PM');

  // 10. the body offers exactly 32 clickable slots per row — no 33rd.
  // Scoped to the background slot layer: a lesson card is also a <button>, so
  // counting every button in the row would include the lessons too.
  const slots = await page.evaluate(() => {
    const bg = document.querySelector('[data-testid="row"] .absolute.inset-0.flex')!;
    return bg.querySelectorAll('button').length;
  });
  expect(slots).toBe(32);
});
