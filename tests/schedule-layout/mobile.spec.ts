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
 * The second rule, added with the narrow day column: the frozen label column
 * is sized from its own content (88px under 400px, 96px to 767px), so these
 * tests measure the real strings it must hold — every translated day name and
 * every roster teacher name — and fail if any of them clips, gets clamped to a
 * hidden third line, or has a word broken across lines.
 *
 * Everything is measured from the rendered DOM, in both directions.
 */

const VIEWPORTS = [
  { width: 320, height: 720, label: '320px', teacherColumnWidth: 88 },
  { width: 375, height: 812, label: '375px', teacherColumnWidth: 88 },
  { width: 390, height: 844, label: '390px', teacherColumnWidth: 88 },
  { width: 430, height: 932, label: '430px', teacherColumnWidth: 96 },
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

/**
 * Measures every frozen-column label the schedule has to render.
 *
 * Three distinct failure modes, because "it looks fine" is not one thing:
 *
 *   clippedWidth    the text box overflows its column horizontally.
 *   clampedHeight   line-clamp-2 is hiding a third line, so part of the
 *                   label is simply gone. Detected by lifting the clamp and
 *                   re-measuring, NOT by comparing scrollHeight to
 *                   clientHeight: Cairo's Arabic glyph box is ~4px taller
 *                   than the 16.25px line box, so a perfectly fine
 *                   single-line Arabic label overflows scrollHeight by
 *                   font ink alone and that comparison reports every Arabic
 *                   day name as clipped.
 *   brokenWord      the longest single word is wider than the content box, so
 *                   `break-words` splits it mid-word ("Wednes / day"). A
 *                   single word cannot wrap cleanly, which is exactly what
 *                   sets the 88px floor — a two-line wrap is acceptable, a
 *                   severed word is not.
 *
 * Word widths are measured with canvas at the element's own computed font, so
 * the number reflects the real rendered face rather than an estimate.
 */
async function readLabels(page: Page) {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;

    return Array.from(document.querySelectorAll('[data-testid="label-row"]')).map((rowEl) => {
      const row = rowEl as HTMLElement;
      const expected = row.dataset.label ?? '';
      const cell = row.querySelector('.sticky') as HTMLElement;
      const text = cell.querySelector('p') as HTMLElement;
      const cs = getComputedStyle(text);
      const ccs = getComputedStyle(cell);

      // Available text width, taken from the cell rather than from the <p>:
      // the <p> is a flex item, so when the text fits its box shrinks to the
      // text and reading clientWidth back would just restate the string's own
      // width. The column's content box is the real constraint.
      const available = cell.getBoundingClientRect().width
        - parseFloat(ccs.paddingInlineStart) - parseFloat(ccs.paddingInlineEnd)
        - parseFloat(ccs.borderInlineStartWidth) - parseFloat(ccs.borderInlineEndWidth);
      ctx.font = `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`;
      const widestWord = Math.max(
        ...expected.split(/\s+/).filter(Boolean).map((w) => ctx.measureText(w).width)
      );

      const lineHeight = parseFloat(cs.lineHeight);
      const clampedLines = Math.round(text.getBoundingClientRect().height / lineHeight);

      // How tall would this label be with nothing hidden? Lift the clamp,
      // measure, put it back. Same width, so the text wraps identically.
      const saved = text.style.cssText;
      text.style.webkitLineClamp = 'unset';
      text.style.display = 'block';
      text.style.overflow = 'visible';
      const naturalLines = Math.round(text.getBoundingClientRect().height / lineHeight);
      text.style.cssText = saved;

      return {
        expected,
        rendered: text.textContent ?? '',
        cellWidth: +cell.getBoundingClientRect().width.toFixed(1),
        availableWidth: +available.toFixed(2),
        clippedWidth: text.scrollWidth > text.clientWidth + 1,
        clampedHeight: naturalLines > clampedLines,
        brokenWord: widestWord > available,
        widestWord: +widestWord.toFixed(2),
        headroom: +(available - widestWord).toFixed(2),
        lines: naturalLines,
      };
    });
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

      // --- frozen label column ----------------------------------------
      // Narrowed on purpose to give the timeline more of the phone's width.
      // The value is content-derived, so it is asserted exactly rather than
      // as a band: a drift in either direction is a real change.
      expect(m.teacherColumnWidth).toBe(vp.teacherColumnWidth);
      expect(m.labelWidth).toBeCloseTo(m.teacherColumnWidth, 0);
      expect(m.labelPosition).toBe('sticky');
      // The narrower column must not eat into the timeline's columns.
      expect(m.columnWidth).toBe(vp.width < 400 ? 80 : 84);

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

  for (const vp of VIEWPORTS) {
    test(`dir=${dir} @ ${vp.label}: every day and teacher label survives the narrow column`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openResponsive(page, dir);
      const labels = await readLabels(page);

      // The probe must actually cover the seven days plus the full roster;
      // a silently empty probe would make every assertion below vacuous.
      expect(labels.length).toBe(21);
      const expectedDays = dir === 'rtl'
        ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      expect(labels.slice(0, 7).map((l) => l.expected)).toEqual(expectedDays);

      for (const l of labels) {
        // Rendered in full — nothing dropped or ellipsised away.
        expect(l.rendered, `label "${l.expected}"`).toBe(l.expected);
        expect(l.cellWidth, `cell for "${l.expected}"`).toBeCloseTo(vp.teacherColumnWidth, 0);
        expect(l.clippedWidth, `"${l.expected}" clips horizontally`).toBe(false);
        expect(l.clampedHeight, `"${l.expected}" loses a clamped third line`).toBe(false);
        expect(
          l.brokenWord,
          `"${l.expected}" has a word broken mid-word (widest word ${l.widestWord}px > ${l.availableWidth}px available)`
        ).toBe(false);
        // Headroom is deliberately recorded in the failure message: at 88px
        // the binding words clear the column by well under a pixel
        // ("Mohammed" 74.54px and "Wednesday" 74.22px in 75.00px), so any
        // future change to the font, weight or padding will land here first.
        // Two lines is the documented allowance; a third would be clamped.
        expect(l.lines, `"${l.expected}" line count`).toBeLessThanOrEqual(2);
      }
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
