import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile gesture contract for the schedule.
 *
 * Two defects drive these, both reported from a real phone:
 *
 *   1. Tapping a lesson unfurled the desktop LessonHoverCard over the
 *      schedule. Radix ignores touch for hovering but still opens on FOCUS,
 *      and a tap focuses the trigger.
 *   2. Touch dragging worked "sometimes" — it was competing with vertical
 *      page scrolling, horizontal timeline scrolling, and the tap that opens
 *      Quick Actions, and which one won depended on how fast the finger moved.
 *
 * Everything runs against master-grid.html, which mounts the REAL
 * MasterScheduleGrid (virtualizer, roster groups, its own scroll container,
 * the real DndContext) wired exactly as MasterSchedulePage wires it. The
 * single-row quick-actions harness cannot show any of this: scrolling and row
 * remounting only exist in the full grid.
 *
 * Input is real trusted touch, not dispatched events.
 */

test.use({ hasTouch: true });

const VIEWPORTS = [
  { width: 320, height: 812, label: '320x812' },
  { width: 375, height: 812, label: '375x812' },
  { width: 390, height: 844, label: '390x844' },
  { width: 430, height: 932, label: '430x932' },
] as const;

/** Anything Radix mounts for an open hover card, plus the preview's own rows. */
const HOVER_CARD_MARKERS = [
  '[data-radix-popper-content-wrapper]',
  '[data-radix-hovercard-content]',
  '[data-radix-hovercard-trigger]',
];

async function openGrid(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/schedule-layout/master-grid.html?dir=${dir}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(
    () => document.querySelectorAll('div.absolute.top-0.h-full.z-20 button').length > 0
  );
}

/** Geometry of the first lesson card, scrolled into view. */
async function firstCard(page: Page) {
  const box = await page.evaluate(async () => {
    const card = document.querySelectorAll('div.absolute.top-0.h-full.z-20 button')[0] as HTMLElement;
    card.scrollIntoView({ block: 'nearest', inline: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = card.getBoundingClientRect();
    return {
      x: r.x + r.width / 2, y: r.y + r.height / 2,
      left: r.x, top: r.y, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height,
      onScreen: r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    };
  });
  // A tap outside the viewport dispatches nothing, which would turn every
  // assertion after it into a false pass.
  expect(box.onScreen, 'lesson card is on screen').toBe(true);
  return box;
}

async function hoverCardState(page: Page) {
  return page.evaluate((markers) => {
    const counts: Record<string, number> = {};
    for (const m of markers) counts[m] = document.querySelectorAll(m).length;
    const text = document.body.innerText;
    return {
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      // Rows only the preview renders.
      previewRows: ['Supervisor', 'Parent(s)', 'Payment Status', 'Lesson Type']
        .filter((label) => text.includes(label)),
    };
  }, HOVER_CARD_MARKERS);
}

// ---------------------------------------------------------------------------
// BUG 1 — the hover preview must not exist on mobile
// ---------------------------------------------------------------------------

for (const dir of ['ltr', 'rtl'] as const) {
  for (const vp of VIEWPORTS) {
    test(`dir=${dir} @ ${vp.label}: one tap opens Quick Actions and no hover preview`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openGrid(page, dir);

      // Never mounted, not merely hidden — before any interaction.
      const before = await hoverCardState(page);
      expect(before.total, `hover-card nodes before tap: ${JSON.stringify(before.counts)}`).toBe(0);
      expect(before.previewRows).toEqual([]);

      const card = await firstCard(page);
      await page.touchscreen.tap(card.x, card.y);

      // Exactly one outcome from a normal tap.
      await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible();

      const after = await hoverCardState(page);
      expect(after.total, `hover-card nodes after tap: ${JSON.stringify(after.counts)}`).toBe(0);
      expect(after.previewRows, 'preview rows leaked onto the page').toEqual([]);

      // The five things the sheet must offer.
      for (const id of ['qa-change-time', 'qa-move-teacher', 'qa-remove', 'qa-view-details', 'qa-close']) {
        await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
      }

      // The complaint was a large floating card covering the schedule, so
      // check what is actually on top: at the middle of the screen the
      // topmost element must belong to the sheet or its own scrim, never to
      // some other floating surface.
      const topMost = await page.evaluate(() => {
        const el = document.elementFromPoint(
          Math.round(window.innerWidth / 2),
          Math.round(window.innerHeight / 2)
        ) as HTMLElement | null;
        if (!el) return { ok: false, what: 'nothing' };
        const inSheet = !!el.closest('[data-testid="quick-actions"]');
        // vaul's overlay is the sheet's own scrim.
        const isOverlay = getComputedStyle(el).position === 'fixed'
          && el.className.toString().includes('inset-0');
        return {
          ok: inSheet || isOverlay,
          what: `${el.tagName}.${el.className.toString().slice(0, 50)}`,
        };
      });
      expect(topMost.ok, `topmost element at screen centre was ${topMost.what}`).toBe(true);
    });
  }
}

test('mobile is known on the FIRST render, so the preview is never mounted even briefly', async ({ page }) => {
  // The gate is only as good as the value it reads. A hook that starts at
  // false and corrects itself in an effect mounts the desktop preview for one
  // render on every phone — and on a remount (the grid is virtualized, rows
  // mount as they scroll into view) it does it again.
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  await expect(page.locator('[data-testid="fixtures"]'))
    .toHaveAttribute('data-first-render-mobile', 'true');

  await page.setViewportSize({ width: 1440, height: 900 });
  await openGrid(page);
  await expect(page.locator('[data-testid="fixtures"]'))
    .toHaveAttribute('data-first-render-mobile', 'false');
});

test('every tappable part of a lesson card leads only to Quick Actions', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  // Student name, the time line, the card's inner edge, and its centre.
  const targets = ['student name', 'time text', 'card border', 'card centre'] as const;

  for (const target of targets) {
    await openGrid(page);
    const card = await firstCard(page);
    const point = await page.evaluate((which) => {
      const el = document.querySelectorAll('div.absolute.top-0.h-full.z-20 button')[0] as HTMLElement;
      const ps = Array.from(el.querySelectorAll('p')) as HTMLElement[];
      const r = el.getBoundingClientRect();
      if (which === 'student name' && ps[0]) {
        const b = ps[0].getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
      if (which === 'time text' && ps[1]) {
        const b = ps[1].getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
      if (which === 'card border') return { x: r.x + 2, y: r.y + r.height / 2 };
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, target);

    expect(point, `${target} point`).not.toBeNull();
    await page.touchscreen.tap(point.x, point.y);

    await expect(
      page.locator('[data-testid="quick-actions"]'),
      `tapping the ${target} should open Quick Actions`
    ).toBeVisible();
    const hc = await hoverCardState(page);
    expect(hc.total, `tapping the ${target} opened a hover preview`).toBe(0);
    // The full dialog is not what a tap opens either.
    expect(await page.locator('[data-testid="lesson-edit"]').count(),
      `tapping the ${target} opened the Lesson Details card`).toBe(0);
    void card;
  }
});

test('focus alone cannot open the preview on mobile', async ({ page }) => {
  // The original defect was focus-driven, so focus the trigger directly
  // rather than relying on a tap to do it.
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  await page.evaluate(() => {
    const card = document.querySelectorAll('div.absolute.top-0.h-full.z-20 button')[0] as HTMLElement;
    card.focus();
    card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    card.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }));
    card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(600);

  const hc = await hoverCardState(page);
  expect(hc.total).toBe(0);
  expect(hc.previewRows).toEqual([]);
});

// ---------------------------------------------------------------------------
// BUG 2 — gestures are deterministic: tap taps, swipe scrolls, no touch drag
// ---------------------------------------------------------------------------

test('a vertical swipe starting on a lesson scrolls instead of dragging', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  const card = await firstCard(page);

  const scrollerTopBefore = await page.evaluate(() => {
    const s = document.querySelector('div.overflow-auto') as HTMLElement;
    return s.scrollTop;
  });

  // Finger down on the card, drag downward, release.
  await page.touchscreen.tap(1, 1); // dismiss nothing; establishes touch input
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('div.overflow-auto').evaluate((s) => { (s as HTMLElement).scrollTop = 0; });

  const client = await page.context().newCDPSession(page);
  const swipe = async (dx: number, dy: number) => {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: card.x, y: card.y }],
    });
    for (let i = 1; i <= 6; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: card.x + (dx * i) / 6, y: card.y + (dy * i) / 6 }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await swipe(0, -200);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const s = document.querySelector('div.overflow-auto') as HTMLElement;
    return {
      scrollTop: s.scrollTop,
      sheets: document.querySelectorAll('[data-testid="quick-actions"]').length,
      dragging: Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
        .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9),
    };
  });

  // It scrolled, it did not drag, and it did not open the sheet.
  expect(after.scrollTop, 'the grid should have scrolled').toBeGreaterThan(scrollerTopBefore);
  expect(after.dragging, 'a swipe must not start a drag').toBe(false);
  expect(after.sheets, 'a swipe must not open Quick Actions').toBe(0);
});

test('a horizontal swipe scrolls the timeline', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  const card = await firstCard(page);

  const before = await page.evaluate(() => {
    const s = document.querySelector('div.overflow-auto') as HTMLElement;
    return Math.round(Math.abs(s.scrollLeft));
  });

  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card.x, y: card.y }] });
  for (let i = 1; i <= 6; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: card.x - (120 * i) / 6, y: card.y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const s = document.querySelector('div.overflow-auto') as HTMLElement;
    return {
      scrollLeft: Math.round(Math.abs(s.scrollLeft)),
      dragging: Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
        .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9),
    };
  });

  expect(after.scrollLeft, 'the timeline should have scrolled').not.toBe(before);
  expect(after.dragging, 'a horizontal swipe must not start a drag').toBe(false);
});

test('a long press on mobile does not start a drag either', async ({ page }) => {
  // Touch dragging is disabled below 768px, so even the gesture that used to
  // activate it must now do nothing.
  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  const card = await firstCard(page);

  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card.x, y: card.y }] });
  await page.waitForTimeout(700); // well past any plausible activation delay
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: card.x + 90, y: card.y }],
  });
  await page.waitForTimeout(200);

  const during = await page.evaluate(() => ({
    dragging: Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
      .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9),
    announcement: document.body.innerText.includes('Draggable item'),
  }));
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  expect(during.dragging, 'no drag state on mobile long-press').toBe(false);
  expect(during.announcement, 'dnd-kit announced a drag on mobile').toBe(false);
  // And nothing was moved.
  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-proposed-move', '');
});

test('the touch drag activator is not wired up at all on mobile', async ({ page }) => {
  // Requirement: the mobile path must not merely refuse to act — the touch
  // activator must not be attached. dnd-kit hands useDraggable's `listeners`
  // straight to the card as React props, and it only includes onTouchStart
  // when a TouchSensor is configured. React stores props on the fiber rather
  // than on the DOM node (so `el.ontouchstart` is always null and would make
  // this assertion vacuous), hence reading the fiber's props bag.
  const readProps = () => page.evaluate(() => {
    const card = document.querySelectorAll('div.absolute.top-0.h-full.z-20 button')[0] as HTMLElement;
    const key = Object.keys(card).find((k) => k.startsWith('__reactProps$'));
    if (!key) return { found: false, handlers: [] as string[] };
    const props = (card as unknown as Record<string, Record<string, unknown>>)[key];
    return {
      found: true,
      handlers: Object.keys(props).filter((k) => /^on(Touch|Mouse|Pointer|KeyDown)/.test(k)),
    };
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await openGrid(page);
  const mobile = await readProps();
  // If the fiber key ever changes shape this test must fail loudly rather
  // than silently pass on an empty handler list.
  expect(mobile.found, 'could not read React props off the lesson card').toBe(true);
  expect(mobile.handlers, 'mobile card must carry no touch activator')
    .not.toContain('onTouchStart');

  await page.setViewportSize({ width: 1440, height: 900 });
  await openGrid(page);
  const desktop = await readProps();
  expect(desktop.found).toBe(true);
  expect(desktop.handlers, 'desktop card should still carry the touch activator')
    .toContain('onTouchStart');
});

// ---------------------------------------------------------------------------
// Desktop must be untouched
// ---------------------------------------------------------------------------

test('desktop keeps the hover preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGrid(page);
  const card = page.locator('div.absolute.top-0.h-full.z-20 button').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1);
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toContainText('Payment Status');
});

test('desktop keeps mouse drag, and a drag proposes a move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGrid(page);

  const from = await page.evaluate(async () => {
    const card = document.querySelectorAll('div.absolute.top-0.h-full.z-20 button')[0] as HTMLElement;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = card.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Past the 8px activation distance, then onto a later column.
  await page.mouse.move(from.x + 20, from.y, { steps: 5 });
  await page.mouse.move(from.x + from.w * 2, from.y, { steps: 10 });
  await page.waitForTimeout(150);

  const dragging = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
      .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9)
  );
  expect(dragging, 'desktop mouse drag should enter the dragging state').toBe(true);

  await page.mouse.up();
  await page.waitForTimeout(250);

  // Dropping on a different slot proposes a move (the existing simulator).
  await expect(page.locator('[data-testid="fixtures"]')).not.toHaveAttribute('data-proposed-move', '');
  // And the UI returned to its normal state.
  const settled = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
      .every((el) => Number(getComputedStyle(el as HTMLElement).opacity) >= 0.9)
  );
  expect(settled, 'the card should return to normal after release').toBe(true);
});

test('a narrow desktop window keeps mouse drag available', async ({ page }) => {
  // The breakpoint gates TOUCH dragging only; a narrowed desktop window must
  // not lose the mouse drag.
  await page.setViewportSize({ width: 500, height: 900 });
  await openGrid(page);
  const from = await firstCard(page);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 5 });
  await page.waitForTimeout(120);
  const dragging = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div.absolute.top-0.h-full.z-20 button'))
      .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9)
  );
  await page.mouse.up();
  expect(dragging).toBe(true);
});
