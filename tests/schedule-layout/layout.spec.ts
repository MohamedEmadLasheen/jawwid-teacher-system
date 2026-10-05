import { test, expect, type Page } from '@playwright/test';

/**
 * Rendered-layout regression tests for the schedule timeline.
 *
 * These exist because the pure geometry suites could not catch a real
 * regression: `minuteToX` was correct in both directions, but the value was
 * applied as a physical `left`, so under dir="rtl" every lesson card and
 * availability band mirrored away from the time header. The defect lived in
 * the CSS layout interaction, not in the arithmetic — so it can only be caught
 * by measuring the actual rendered boxes in a real browser.
 *
 * Everything here measures the INLINE-START edge, i.e. the left edge in LTR and
 * the right edge in RTL. That is the direction-independent way to ask "is this
 * element where the header says this minute is?".
 */

const COLUMN_WIDTHS = [40, 61, 96];
const DIRECTIONS = ['ltr', 'rtl'] as const;

/** Inline-start offset of a box relative to a container, in either direction. */
async function inlineStartOffsets(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="scroller"]') as HTMLElement;
    const dir = getComputedStyle(scroller).direction;
    const rtl = dir === 'rtl';

    // Inline-start edge of a rect, measured from the scroller's own
    // inline-start edge, with horizontal scroll removed so values are stable.
    const s = scroller.getBoundingClientRect();
    const inlineStart = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return rtl ? +(s.right - r.right).toFixed(3) : +(r.left - s.left).toFixed(3);
    };
    const inlineEnd = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return rtl ? +(s.right - r.left).toFixed(3) : +(r.right - s.left).toFixed(3);
    };

    const headerCells: Record<string, number> = {};
    const headerEnds: Record<string, number> = {};
    for (const d of Array.from(scroller.querySelectorAll('div'))) {
      const t = d.textContent?.trim() ?? '';
      if (d.children.length === 0 && /^\d{1,2}:\d{2} (AM|PM)$/.test(t)) {
        headerCells[t] = inlineStart(d)!;
        headerEnds[t] = inlineEnd(d)!;
      }
    }

    const row = scroller.querySelector('[data-testid="row"]')!;
    const lessonEls = Array.from(row.querySelectorAll('div.absolute.top-0.h-full.z-20'));
    const lessons = lessonEls.map((el) => ({
      start: inlineStart(el)!,
      end: inlineEnd(el)!,
      width: +el.getBoundingClientRect().width.toFixed(3),
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    })).sort((a, b) => a.start - b.start);

    const bandEls = Array.from(row.querySelectorAll('div[aria-hidden]'));
    const bands = bandEls.map((el) => ({
      start: inlineStart(el)!, end: inlineEnd(el)!,
      width: +el.getBoundingClientRect().width.toFixed(3),
    })).sort((a, b) => a.start - b.start);

    const nowEl = scroller.querySelector('div.w-0\\.5.bg-red-500');

    // The frozen label column (sticky) — measured in viewport coords, since
    // the point is that it does NOT move when the timeline scrolls.
    const labelEl = row.querySelector('.sticky') as HTMLElement | null;

    return {
      dir,
      headerCells,
      headerEnds,
      lessons,
      bands,
      now: nowEl ? inlineStart(nowEl) : null,
      labelViewportLeft: labelEl ? +labelEl.getBoundingClientRect().left.toFixed(2) : null,
      scrollLeft: Math.round(scroller.scrollLeft),
      maxScroll: scroller.scrollWidth - scroller.clientWidth,
    };
  });
}


/** The header renders 12-hour labels; assertions below stay in 24h for
 *  readability and are translated to the rendered key here. */
function hdr(m: { headerCells: Record<string, number> }, hhmm: string): number {
  const [h, min] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const key = `${h12}:${String(min).padStart(2, '0')} ${period}`;
  const v = m.headerCells[key];
  if (v === undefined) throw new Error(`header cell "${key}" (${hhmm}) not found`);
  return v;
}

async function openHarness(page: Page, dir: string, cw: number) {
  await page.goto(`/tests/schedule-layout/index.html?dir=${dir}&cw=${cw}`);
  // `state: 'attached'` — the marker is a zero-size div, which Playwright's
  // default visibility check would never consider visible.
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForSelector('[data-testid="row"] div.absolute.top-0.h-full.z-20');
  // The fixture renders four lessons; wait for all of them before measuring.
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="row"] div.absolute.top-0.h-full.z-20').length === 4
  );
}

for (const dir of DIRECTIONS) {
  test.describe(`dir=${dir}`, () => {
    for (const cw of COLUMN_WIDTHS) {
      test(`lesson, availability and header align at columnWidth=${cw}px`, async ({ page }) => {
        await openHarness(page, dir, cw);
        const m = await inlineStartOffsets(page);

        expect(m.dir).toBe(dir);

        // --- D. Multiple time positions -------------------------------
        // Working-window start (14:00), an interior time (15:30), a
        // fractional-duration lesson (16:00+40m) and the window end (19:00).
        const [lStart, lMid, l40, lEnd] = m.lessons;

        // Window start is now 12:00 (full-time). This also proves the new
        // boundary flows through the same geometry as every other time.
        expect(lStart.start).toBeCloseTo(hdr(m, '12:00'), 1);
        expect(lStart.end).toBeCloseTo(hdr(m, '12:30'), 1);

        expect(lMid.start).toBeCloseTo(hdr(m, '15:30'), 1);
        expect(lMid.end).toBeCloseTo(hdr(m, '16:00'), 1);

        // --- F. Duration handling -------------------------------------
        // 30-minute lessons occupy exactly one column.
        expect(lStart.width).toBeCloseTo(cw, 1);
        expect(lMid.width).toBeCloseTo(cw, 1);

        // 40-minute lesson: proportional (40/30 of a column), never rounded
        // up to two columns, and ending exactly under 16:40 — which is two
        // thirds of the way through the 16:30 column.
        expect(l40.start).toBeCloseTo(hdr(m, '16:00'), 1);
        expect(l40.width).toBeCloseTo((40 * cw) / 30, 1);
        expect(l40.width).not.toBeCloseTo(2 * cw, 1);
        const x1640 = hdr(m, '16:30') + cw / 3;
        expect(l40.end).toBeCloseTo(x1640, 1);

        // End boundary: a lesson finishing at 19:00 ends on the 19:00 tick.
        expect(lEnd.start).toBeCloseTo(hdr(m, '18:30'), 1);
        expect(lEnd.end).toBeCloseTo(hdr(m, '19:00'), 1);

        // --- Availability bands ---------------------------------------
        // Free capacity = the 12:00-19:00 window minus the four lessons.
        // First band starts at 12:30 (after the 12:00 lesson); last band ends
        // at 18:30 (where the closing lesson begins).
        expect(m.bands.length).toBeGreaterThan(0);
        expect(m.bands[0].start).toBeCloseTo(hdr(m, '12:30'), 1);
        expect(m.bands[m.bands.length - 1].end).toBeCloseTo(hdr(m, '18:30'), 1);

        // No band may start before the window or end after it. 12:00 and
        // 19:00 are the configured full-time boundaries.
        for (const b of m.bands) {
          expect(b.start).toBeGreaterThanOrEqual(hdr(m, '12:00') - 0.5);
          expect(b.end).toBeLessThanOrEqual(hdr(m, '19:00') + 0.5);
        }

        // The four boundaries named in the roster spec must sit exactly the
        // right number of columns apart. Measured as offsets FROM 12:00 so the
        // assertion is independent of the frozen label column's width and of
        // the scroll position, and valid in both directions.
        for (const [label, minute] of [['14:00', 840], ['18:00', 1080], ['19:00', 1140]] as const) {
          const columnsFromNoon = (minute - 720) / 30;
          expect(hdr(m, label) - hdr(m, '12:00')).toBeCloseTo(columnsFromNoon * cw, 1);
        }
      });
    }

    test('current-time indicator sits on the same axis as the header', async ({ page }) => {
      await openHarness(page, dir, 96);
      const m = await page.evaluate(() => {
        const scroller = document.querySelector('[data-testid="scroller"]') as HTMLElement;
        const rtl = getComputedStyle(scroller).direction === 'rtl';
        const s = scroller.getBoundingClientRect();
        const inlineStart = (el: Element) => {
          const r = el.getBoundingClientRect();
          return rtl ? +(s.right - r.right).toFixed(3) : +(r.left - s.left).toFixed(3);
        };
        const now = scroller.querySelector('div.w-0\\.5.bg-red-500');
        const cells: Record<string, number> = {};
        for (const d of Array.from(scroller.querySelectorAll('div'))) {
          const t = d.textContent?.trim() ?? '';
          if (d.children.length === 0 && /^\d{1,2}:\d{2} (AM|PM)$/.test(t)) cells[t] = inlineStart(d);
        }
        if (!now) return { present: false as const };
        const LABEL = 176, CW = 96, GRID_START = 8 * 60;
        const d = new Date();
        const mins = d.getHours() * 60 + d.getMinutes();
        return {
          present: true as const,
          nowStart: inlineStart(now),
          expected: LABEL + ((mins - GRID_START) * CW) / 30,
          minutes: mins,
          cells,
        };
      });

      // The marker only renders between 07:00 and midnight. Outside that it is
      // legitimately absent, so assert alignment only when it is on screen.
      if (!m.present) {
        test.skip(true, 'current time is outside the 07:00-24:00 grid window');
        return;
      }
      // Measured against the harness scroller, whose inline-start is the
      // content origin: label column + minuteToX(now).
      expect(m.nowStart).toBeCloseTo(m.expected, 1);
    });

    test('header, lessons and bands stay aligned while scrolling; day column stays frozen', async ({ page }) => {
      await openHarness(page, dir, 96);

      const before = await inlineStartOffsets(page);
      const frozenAt = before.labelViewportLeft;
      expect(frozenAt).not.toBeNull();

      const positions = [0, 120, 300, before.maxScroll, 150, 0];
      for (const target of positions) {
        await page.evaluate((x) => {
          const el = document.querySelector('[data-testid="scroller"]') as HTMLElement;
          // In RTL, Chromium reports scrollLeft as <= 0; drive the magnitude.
          el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -x : x;
        }, target);
        await page.waitForTimeout(40);

        const m = await inlineStartOffsets(page);

        // E. Alignment must survive every scroll position, both directions.
        expect(m.lessons[1].start).toBeCloseTo(hdr(m, '15:30'), 1);
        expect(m.lessons[2].start).toBeCloseTo(hdr(m, '16:00'), 1);
        expect(m.bands[0].start).toBeCloseTo(hdr(m, '12:30'), 1);

        // The frozen day column must not move with the timeline.
        expect(m.labelViewportLeft).toBeCloseTo(frozenAt!, 1);
      }
    });
  });
}

test('RTL and LTR produce identical inline-axis coordinates', async ({ page }) => {
  // The strongest statement of the fix: the whole layout is a mirror image, so
  // every inline-start offset must match between the two directions.
  await openHarness(page, 'ltr', 96);
  const ltr = await inlineStartOffsets(page);
  await openHarness(page, 'rtl', 96);
  const rtl = await inlineStartOffsets(page);

  expect(rtl.lessons.length).toBe(ltr.lessons.length);
  for (let i = 0; i < ltr.lessons.length; i++) {
    expect(rtl.lessons[i].start).toBeCloseTo(ltr.lessons[i].start, 1);
    expect(rtl.lessons[i].width).toBeCloseTo(ltr.lessons[i].width, 1);
  }
  expect(rtl.bands.length).toBe(ltr.bands.length);
  for (let i = 0; i < ltr.bands.length; i++) {
    expect(rtl.bands[i].start).toBeCloseTo(ltr.bands[i].start, 1);
    expect(rtl.bands[i].width).toBeCloseTo(ltr.bands[i].width, 1);
  }
  for (const key of ['12:00', '14:00', '15:30', '16:00', '18:30', '19:00']) {
    expect(hdr(rtl, key)).toBeCloseTo(hdr(ltr, key), 1);
  }
});
