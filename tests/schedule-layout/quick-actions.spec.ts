import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile lesson Quick Actions.
 *
 * The problem these cover: on a phone, tapping a lesson used to open the full
 * desktop LessonDetailDialog, and changing a time meant a time input, a
 * preview, a second dialog, a scope choice and a confirm. Quick Actions makes
 * the two common operations two taps, and these tests assert the behaviour
 * through the real components — including WHICH scheduling action each path
 * sends to the database, recorded by the supabase stub.
 *
 * Every lesson tap here is a real touch tap dispatched at the card's own
 * coordinates, so the tap-vs-drag arbitration under test is the production
 * one (useScheduleDragSensors), not a synthetic click on a handler.
 */

// Real touch events, so the drag sensors' touch path is the one exercised.
test.use({ hasTouch: true });

const VIEWPORTS = [
  { width: 320, height: 720, label: '320px' },
  { width: 375, height: 812, label: '375px' },
  { width: 390, height: 844, label: '390px' },
  { width: 430, height: 932, label: '430px' },
] as const;

const SUBJECT_START = 15 * 60;   // the lesson under test: 3:00 PM
const OCCUPIED_START = 16 * 60;  // another lesson of the same teacher: 4:00 PM
const SHIFT_START = 14 * 60;     // fixture working window: 2:00 PM – 6:00 PM
const SHIFT_END = 18 * 60;

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/schedule-layout/quick-actions.html?dir=${dir}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="row"] div.absolute.top-0.h-full.z-20').length === 2
  );
  await page.evaluate(() => (window as any).__supabaseStub.reset());
}

/**
 * Taps the lesson card for `startMinute` the way a finger would.
 *
 * The card has to be scrolled into view first: the timeline is far wider than
 * a phone (a 3:00 PM lesson sits ~1120px along it at a 375px viewport), so an
 * untouched grid has the card off-screen and a tap at its coordinates would
 * land outside the window and dispatch nothing at all.
 */
async function tapLesson(page: Page, startMinute: number) {
  const box = await page.evaluate(async (minute) => {
    const cards = Array.from(
      document.querySelectorAll('[data-testid="row"] div.absolute.top-0.h-full.z-20 button')
    ) as HTMLElement[];
    // Identify by the time the card itself renders, not by DOM order.
    const target = cards.find((c) => {
      const h = Math.floor(minute / 60) % 24;
      const m = minute % 60;
      const label = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
      return (c.textContent ?? '').includes(label);
    });
    if (!target) return null;
    target.scrollIntoView({ block: 'nearest', inline: 'center' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = target.getBoundingClientRect();
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      onScreen: r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    };
  }, startMinute);

  expect(box, `lesson card for minute ${startMinute}`).not.toBeNull();
  // A tap outside the viewport dispatches nothing, which would make every
  // assertion after it a false negative. Fail loudly instead.
  expect(box!.onScreen, `lesson card for minute ${startMinute} is on screen`).toBe(true);
  await page.touchscreen.tap(box!.x, box!.y);
}

/**
 * Waits for the bottom sheet to finish animating in.
 *
 * vaul slides the sheet up with a transform, so it is already "visible" to
 * Playwright while still a few hundred pixels below the fold — measuring
 * geometry straight after the tap reports a sheet hanging off the bottom of
 * the screen. Settled means the transform has been cleared and the rect has
 * stopped moving.
 */
async function waitForSheetSettled(page: Page) {
  await page.locator('[data-testid="quick-actions"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="quick-actions"]') as HTMLElement | null;
    if (!el) return false;
    return getComputedStyle(el).transform === 'none';
  });
}

const rpcCalls = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.rpcCalls as { fn: string; args: any }[]);
const tableOps = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.tableOps as { table: string; op: string }[]);
const setConflict = (page: Page, on: boolean) =>
  page.evaluate((v) => { (window as any).__supabaseStub.conflict = v; }, on);

/** Every apply_schedule_change action issued, in order. */
async function appliedActions(page: Page) {
  return (await rpcCalls(page))
    .filter((c) => c.fn === 'apply_schedule_change')
    .map((c) => ({ action: c.args.p_action, payload: c.args.p_payload }));
}

// ---------------------------------------------------------------------------
// A + B — a tap opens Quick Actions, and it shows the lesson's context
// ---------------------------------------------------------------------------

for (const vp of VIEWPORTS) {
  test(`@ ${vp.label}: tapping a lesson opens Quick Actions with full context`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await open(page);

    // Not open until tapped.
    expect(await page.locator('[data-testid="quick-actions"]').count()).toBe(0);

    await tapLesson(page, SUBJECT_START);
    await waitForSheetSettled(page);

    // B — student, time, teacher, and the four actions.
    await expect(page.locator('[data-testid="qa-student"]')).toHaveText('Ahmed Mohamed');
    await expect(page.locator('[data-testid="qa-time"]')).toHaveText('3:00 PM–3:30 PM');
    await expect(page.locator('[data-testid="qa-teacher"]')).toHaveText('Mohamed Hussein');
    await expect(page.locator('[data-testid="qa-day"]')).toHaveText('Sunday');
    for (const id of ['qa-change-time', 'qa-move-teacher', 'qa-remove', 'qa-view-details']) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }

    // The full dialog is NOT what a tap opens any more.
    expect(await page.locator('[role="dialog"][data-state="open"] form').count()).toBe(0);

    // G — touch targets.
    const heights = await page.evaluate(() =>
      ['qa-change-time', 'qa-move-teacher', 'qa-remove', 'qa-view-details'].map((id) => ({
        id,
        h: +(document.querySelector(`[data-testid="${id}"]`) as HTMLElement)
          .getBoundingClientRect().height.toFixed(1),
      }))
    );
    for (const { id, h } of heights) expect(h, `${id} height`).toBeGreaterThanOrEqual(44);
    // The three primary actions aim higher than the bare minimum.
    for (const { id, h } of heights.filter((x) => x.id !== 'qa-view-details')) {
      expect(h, `${id} primary height`).toBeGreaterThanOrEqual(48);
    }

    // The sheet must not swallow the whole screen, nor overflow it.
    const geom = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="quick-actions"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        height: r.height, viewport: window.innerHeight,
        bottom: r.bottom, docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    expect(geom.height).toBeLessThanOrEqual(geom.viewport * 0.9);
    expect(geom.bottom).toBeLessThanOrEqual(geom.viewport + 1);
    // No horizontal layout break.
    expect(geom.docScrollW).toBeLessThanOrEqual(geom.clientW + 1);
  });
}

// ---------------------------------------------------------------------------
// C — change time
// ---------------------------------------------------------------------------

test('change time: picker is derived from the timeline, current time marked', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();

  const options = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="qa-time-option"]')).map((el) => {
      const e = el as HTMLElement;
      return {
        start: Number(e.dataset.startMinute),
        current: e.dataset.current === 'true',
        blocked: e.dataset.blocked === 'true',
        reason: e.dataset.blockReason,
      };
    })
  );

  // 8 AM – 8 PM in 30-minute columns = 24 candidates, straight from the grid.
  expect(options.length).toBe(24);
  expect(options[0].start).toBe(8 * 60);
  expect(options[1].start - options[0].start).toBe(30);

  // The current time is the marked row and is selectable.
  const current = options.filter((o) => o.current);
  expect(current.length).toBe(1);
  expect(current[0].start).toBe(SUBJECT_START);
  expect(current[0].blocked).toBe(false);

  const at = (m: number) => options.find((o) => o.start === m)!;
  // Outside the fixture working window.
  expect(at(SHIFT_START - 30).reason).toBe('outside_working_window');
  expect(at(SHIFT_END).reason).toBe('outside_working_window');
  // Inside the window.
  expect(at(SHIFT_START).blocked).toBe(false);
  // Taken by the teacher's other lesson.
  expect(at(OCCUPIED_START).reason).toBe('overlaps_lesson');
  // And the picker itself scrolls rather than stretching the sheet.
  const scrolls = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="qa-time-list"]') as HTMLElement;
    return { scrollH: el.scrollHeight, clientH: el.clientHeight, overflowY: getComputedStyle(el).overflowY };
  });
  expect(scrolls.overflowY).toBe('auto');
  expect(scrolls.scrollH).toBeGreaterThan(scrolls.clientH);
});

test('change time: an available time confirms through move_lesson, scope after selection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await setConflict(page, false);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();

  // Scope is NOT asked before a time is chosen — that is the point of the flow.
  expect(await page.locator('[data-testid="qa-scope"]').count()).toBe(0);
  expect(await page.locator('[data-testid="qa-confirm"]').count()).toBe(0);

  const target = 17 * 60; // 5:00 PM — inside the window, nothing booked
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${target}"]`).click();

  await expect(page.locator('[data-testid="qa-conflict-status"]')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('[data-testid="qa-selection"]')).toHaveText('5:00 PM');
  await expect(page.locator('[data-testid="qa-scope"]')).toBeVisible();

  // The conflict verdict came from the existing RPC, not a second algorithm.
  const checks = (await rpcCalls(page)).filter((c) => c.fn === 'check_schedule_conflict');
  expect(checks.length).toBe(1);
  expect(checks[0].args.p_start_minute).toBe(target);
  expect(checks[0].args.p_exclude_lesson_id).toBe('L-subject');

  const confirm = page.locator('[data-testid="qa-confirm"]');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  const applied = await appliedActions(page);
  expect(applied.length).toBe(1);
  expect(applied[0].action).toBe('move_lesson');
  expect(applied[0].payload.lesson_id).toBe('L-subject');
  expect(applied[0].payload.new_start_minute).toBe(target);
  expect(applied[0].payload.scope).toBe('this_occurrence');
  // Default scope writes a dated exception, so it must carry the date.
  expect(applied[0].payload.occurrence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Teacher was not touched, so it must not be sent.
  expect(applied[0].payload.new_teacher_id).toBeUndefined();

  await expect(page.locator('[data-testid="quick-actions"]')).toHaveCount(0);
});

test('change time: "all future" scope is passed through to move_lesson', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await setConflict(page, false);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`).click();
  await expect(page.locator('[data-testid="qa-scope"]')).toBeVisible();
  await page.locator('[data-testid="qa-scope-future"]').click();
  await page.locator('[data-testid="qa-confirm"]').click();

  const applied = await appliedActions(page);
  expect(applied[0].action).toBe('move_lesson');
  expect(applied[0].payload.scope).toBe('all_future');
  // all_future updates the recurring row; no dated exception is written.
  expect(applied[0].payload.occurrence_date).toBeUndefined();
});

test('change time: a conflict blocks confirmation and another time can be picked at once', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await setConflict(page, true);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();

  const conflicted = 17 * 60;
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${conflicted}"]`).click();

  const status = page.locator('[data-testid="qa-conflict-status"]');
  await expect(status).toHaveAttribute('data-state', 'conflict');
  // The reason is explained, not just flagged.
  await expect(status).toContainText('Teacher is already booked at this time.');
  await expect(page.locator('[data-testid="qa-confirm"]')).toBeDisabled();
  // The chosen time stays visible, and the list stays open.
  await expect(page.locator('[data-testid="qa-selection"]')).toHaveText('5:00 PM');
  await expect(page.locator('[data-testid="qa-time-list"]')).toBeVisible();

  // Picking another time immediately — no closing and restarting.
  await setConflict(page, false);
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60 + 30}"]`).click();
  await expect(status).toHaveAttribute('data-state', 'available');
  await expect(page.locator('[data-testid="qa-confirm"]')).toBeEnabled();

  // Nothing was written while it was conflicted.
  expect(await appliedActions(page)).toHaveLength(0);
});

test('change time: blocked candidates cannot be selected', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();

  const blocked = page.locator(`[data-testid="qa-time-option"][data-start-minute="${OCCUPIED_START}"]`);
  await expect(blocked).toBeDisabled();
  await blocked.click({ force: true });

  // No selection, no conflict check, no write.
  expect(await page.locator('[data-testid="qa-confirm"]').count()).toBe(0);
  expect((await rpcCalls(page)).filter((c) => c.fn === 'check_schedule_conflict')).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// D — remove from schedule
// ---------------------------------------------------------------------------

test('remove: confirmation explains both consequences before either is tapped', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-remove"]').click();

  await expect(page.locator('[data-testid="qa-remove-confirm"]')).toBeVisible();
  const occurrence = page.locator('[data-testid="qa-remove-occurrence"]');
  const end = page.locator('[data-testid="qa-remove-end"]');

  await expect(occurrence).toContainText('This occurrence only');
  await expect(occurrence).toContainText('This removes the lesson from this occurrence only');
  await expect(end).toContainText('End this lesson and future occurrences');
  await expect(end).toContainText('ends the recurring lesson from this point forward');
  // Never the bare word "Delete" for something that is not a delete.
  await expect(page.locator('[data-testid="qa-remove-confirm"]')).not.toContainText('Delete');

  for (const target of [occurrence, end]) {
    const h = await target.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  }
  // Nothing has been written just by opening the confirmation.
  expect(await appliedActions(page)).toHaveLength(0);
});

test('remove: "this occurrence" uses cancel_occurrence and deletes nothing', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-remove"]').click();
  await page.locator('[data-testid="qa-remove-occurrence"]').click();

  const applied = await appliedActions(page);
  expect(applied.length).toBe(1);
  expect(applied[0].action).toBe('cancel_occurrence');
  expect(applied[0].payload.lesson_id).toBe('L-subject');
  expect(applied[0].payload.occurrence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
  await expect(page.locator('[data-testid="quick-actions"]')).toHaveCount(0);
});

test('remove: "end and future" uses end_lesson and deletes nothing', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-remove"]').click();
  await page.locator('[data-testid="qa-remove-end"]').click();

  const applied = await appliedActions(page);
  expect(applied.length).toBe(1);
  expect(applied[0].action).toBe('end_lesson');
  expect(applied[0].payload.lesson_id).toBe('L-subject');

  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// E — move to another teacher
// ---------------------------------------------------------------------------

test('move teacher: searchable picker, conflict check, scope, confirm', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await setConflict(page, false);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-move-teacher"]').click();

  // The lesson's own teacher is not an option to "move" to.
  const names = await page.locator('[data-testid="qa-teacher-option"]').allInnerTexts();
  expect(names.join(' ')).not.toContain('Mohamed Hussein');
  expect(names.length).toBe(2);

  // Search narrows it.
  await page.locator('[data-testid="qa-teacher-search"]').fill('Rokaya');
  await expect(page.locator('[data-testid="qa-teacher-option"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="qa-teacher-option"]')).toContainText('Rokaya Ramadan');

  // Nothing is auto-selected: the admin picks.
  expect(await page.locator('[data-testid="qa-teacher-option"][data-selected="true"]').count()).toBe(0);
  expect(await page.locator('[data-testid="qa-confirm"]').count()).toBe(0);

  await page.locator('[data-testid="qa-teacher-option"][data-teacher-id="T2"]').click();
  await expect(page.locator('[data-testid="qa-conflict-status"]')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('[data-testid="qa-scope"]')).toBeVisible();

  const checks = (await rpcCalls(page)).filter((c) => c.fn === 'check_schedule_conflict');
  expect(checks.length).toBe(1);
  expect(checks[0].args.p_teacher_id).toBe('T2');

  await page.locator('[data-testid="qa-confirm"]').click();
  const applied = await appliedActions(page);
  expect(applied[0].action).toBe('move_lesson');
  expect(applied[0].payload.new_teacher_id).toBe('T2');
  // The time was not touched, so it must not be sent.
  expect(applied[0].payload.new_start_minute).toBeUndefined();
});

test('move teacher: a conflicting teacher blocks confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await setConflict(page, true);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-move-teacher"]').click();
  await page.locator('[data-testid="qa-teacher-option"][data-teacher-id="T2"]').click();

  await expect(page.locator('[data-testid="qa-conflict-status"]')).toHaveAttribute('data-state', 'conflict');
  await expect(page.locator('[data-testid="qa-confirm"]')).toBeDisabled();
  expect(await appliedActions(page)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// F — view details still opens the existing dialog
// ---------------------------------------------------------------------------

test('view details opens the existing LessonDetailDialog', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-view-details"]').click();

  // Quick Actions hands over; the full dialog takes the lesson.
  await expect(page.locator('[data-testid="quick-actions"]')).toHaveCount(0);
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  // Capabilities only the full dialog has.
  await expect(dialog).toContainText('Students');
  expect(await dialog.locator('input[type="time"]').count()).toBeGreaterThan(0);
  // Opening it writes nothing.
  expect(await appliedActions(page)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// H + I — Arabic / RTL and English / LTR
// ---------------------------------------------------------------------------

for (const dir of ['ltr', 'rtl'] as const) {
  test(`dir=${dir}: sheet renders in the page's direction with localized labels`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, dir);
    await tapLesson(page, SUBJECT_START);

    const sheet = page.locator('[data-testid="quick-actions"]');
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => getComputedStyle(el).direction)).toBe(dir);

    const labels = {
      changeTime: dir === 'rtl' ? 'تغيير الوقت' : 'Change Time',
      moveTeacher: dir === 'rtl' ? 'نقل إلى معلم آخر' : 'Move to another teacher',
      remove: dir === 'rtl' ? 'إزالة من الجدول' : 'Remove from schedule',
      details: dir === 'rtl' ? 'عرض التفاصيل' : 'View details',
    };
    await expect(page.locator('[data-testid="qa-change-time"]')).toContainText(labels.changeTime);
    await expect(page.locator('[data-testid="qa-move-teacher"]')).toContainText(labels.moveTeacher);
    await expect(page.locator('[data-testid="qa-remove"]')).toContainText(labels.remove);
    await expect(page.locator('[data-testid="qa-view-details"]')).toContainText(labels.details);

    // Actions must fill the sheet's width in both directions, not drift.
    const geom = await page.evaluate(() => {
      const sheetEl = document.querySelector('[data-testid="quick-actions"]') as HTMLElement;
      const btn = document.querySelector('[data-testid="qa-change-time"]') as HTMLElement;
      const s = sheetEl.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      return {
        leftGap: b.left - s.left, rightGap: s.right - b.right,
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    expect(Math.abs(geom.leftGap - geom.rightGap)).toBeLessThanOrEqual(1);
    expect(geom.docScrollW).toBeLessThanOrEqual(geom.clientW + 1);

    // Arabic time labels keep the readable 12-hour format.
    await page.locator('[data-testid="qa-change-time"]').click();
    await expect(
      page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`)
    ).toContainText('5:00 PM');
  });
}

// ---------------------------------------------------------------------------
// J + negative tests
// ---------------------------------------------------------------------------

test('desktop regression: a lesson click still opens the full dialog, not the sheet', async ({ page }) => {
  // The routing runs through the app's own useIsMobile (768px). At desktop
  // width a lesson click must land where it always did.
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-is-mobile', 'false');

  await tapLesson(page, SUBJECT_START);

  // The full dialog, not the sheet.
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  expect(await page.locator('[data-testid="quick-actions"]').count()).toBe(0);
  // And its desktop capabilities are intact, including the time input the
  // mobile flow deliberately avoids.
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toContainText('Students');
  expect(await dialog.locator('input[type="time"]').count()).toBeGreaterThan(0);
  expect(await appliedActions(page)).toHaveLength(0);
});

test('mobile routing: the same click below 768px opens the sheet instead', async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await open(page);
  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-is-mobile', 'true');

  await tapLesson(page, SUBJECT_START);
  await waitForSheetSettled(page);
  expect(await page.locator('[role="dialog"] input[type="time"]').count()).toBe(0);
});

test('closing the sheet without confirming mutates nothing', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`).click();
  await expect(page.locator('[data-testid="qa-scope"]')).toBeVisible();

  // Out via the explicit close affordance.
  await page.locator('[data-testid="qa-close"]').click();
  await expect(page.locator('[data-testid="quick-actions"]')).toHaveCount(0);

  expect(await appliedActions(page)).toHaveLength(0);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('the overlay is also a way out, and it mutates nothing either', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await waitForSheetSettled(page);
  await page.locator('[data-testid="qa-remove"]').click();
  await expect(page.locator('[data-testid="qa-remove-confirm"]')).toBeVisible();

  // Tap above the sheet — the overlay, where a thumb lands to dismiss.
  const above = await page.evaluate(() => {
    const r = (document.querySelector('[data-testid="quick-actions"]') as HTMLElement)
      .getBoundingClientRect();
    return { x: window.innerWidth / 2, y: Math.max(8, r.top / 2) };
  });
  await page.mouse.click(above.x, above.y);
  await expect(page.locator('[data-testid="quick-actions"]')).toHaveCount(0);

  expect(await appliedActions(page)).toHaveLength(0);
});

test('the close affordance is touch-sized and present on every step', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await waitForSheetSettled(page);

  const close = page.locator('[data-testid="qa-close"]');
  for (const step of ['qa-change-time', 'qa-move-teacher', 'qa-remove'] as const) {
    await expect(close).toBeVisible();
    expect(await close.evaluate((el) => el.getBoundingClientRect().height))
      .toBeGreaterThanOrEqual(44);
    await page.locator(`[data-testid="${step}"]`).click();
    await expect(close).toBeVisible();
    await page.locator('[data-testid="qa-back"]').click();
  }
});

test('going back from a sub-step discards the pending selection', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`).click();
  await expect(page.locator('[data-testid="qa-confirm"]')).toBeVisible();

  await page.locator('[data-testid="qa-back"]').click();
  await expect(page.locator('[data-testid="qa-change-time"]')).toBeVisible();
  expect(await page.locator('[data-testid="qa-confirm"]').count()).toBe(0);

  // Re-entering starts clean.
  await page.locator('[data-testid="qa-change-time"]').click();
  expect(await page.locator('[data-testid="qa-time-option"][data-selected="true"]').count()).toBe(0);
  expect(await appliedActions(page)).toHaveLength(0);
});

test('no mutation path issues a DELETE, and no schema statement is ever sent', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);

  // Walk every write path in one session.
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-remove"]').click();
  await page.locator('[data-testid="qa-remove-occurrence"]').click();
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-remove"]').click();
  await page.locator('[data-testid="qa-remove-end"]').click();
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`).click();
  await page.locator('[data-testid="qa-confirm"]').click();

  const calls = await rpcCalls(page);
  const actions = (await appliedActions(page)).map((a) => a.action);
  expect(actions).toEqual(['cancel_occurrence', 'end_lesson', 'move_lesson']);

  // Only the two RPCs the schedule already had.
  expect([...new Set(calls.map((c) => c.fn))].sort())
    .toEqual(['apply_schedule_change', 'check_schedule_conflict']);

  // No table-level delete, and the lesson id is stable across all three.
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
  const ids = (await appliedActions(page)).map((a) => a.payload.lesson_id);
  expect(ids).toEqual(['L-subject', 'L-subject', 'L-subject']);

  // Nothing resembling DDL or a participant removal was sent.
  const serialized = JSON.stringify(calls).toLowerCase();
  for (const forbidden of ['drop ', 'alter table', 'create table', 'truncate', 'remove_participant']) {
    expect(serialized, `must not contain "${forbidden}"`).not.toContain(forbidden);
  }
});

test('tapping a lesson does not unfurl the desktop hover preview', async ({ page }) => {
  // Radix HoverCard ignores touch for hovering but still opens on FOCUS, and
  // a tap focuses the card — so the full desktop preview used to render
  // behind the sheet on every mobile tap.
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await waitForSheetSettled(page);

  const popovers = await page.locator('[data-radix-popper-content-wrapper]').count();
  expect(popovers).toBe(0);
  // Content only the hover card renders.
  expect(await page.getByText('Payment Status').count()).toBe(0);
});

test('desktop keeps the hover preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const card = page.locator('[data-testid="row"] div.absolute.top-0.h-full.z-20 button').first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1);
});

test('a tap on a lesson does not start a drag', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);

  // A real tap: pointerdown/up at one point, no movement, no hold.
  await tapLesson(page, SUBJECT_START);

  // The sheet opened, which means the click survived the drag sensor.
  await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible();
  // And dnd-kit never put the card into its dragging state (opacity 0.4).
  const dragging = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="row"] button'))
      .some((el) => Number(getComputedStyle(el as HTMLElement).opacity) < 0.9)
  );
  expect(dragging).toBe(false);
});

test('no console errors across the whole flow', async ({ page }) => {
  const errors: string[] = [];
  /**
   * One known message is excluded: dnd-kit's touch sensor calls
   * preventDefault from a listener the browser registered as passive, and
   * Chrome logs "Unable to preventDefault inside passive event listener
   * invocation". It comes from the drag library, predates this change (the
   * default PointerSensor does the same), and the documented way to silence
   * it is `touch-action: none` on the lesson card — which would stop the grid
   * from scrolling when a swipe starts on a card, the very thing the new
   * activation constraints exist to preserve. Filtered deliberately rather
   * than asserted away.
   */
  const KNOWN_DND_PASSIVE_WARNING = 'Unable to preventDefault inside passive event listener';
  const record = (text: string) => {
    if (!text.includes(KNOWN_DND_PASSIVE_WARNING)) errors.push(text);
  };
  page.on('console', (m) => { if (m.type() === 'error') record(m.text()); });
  page.on('pageerror', (e) => record(String(e)));

  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await tapLesson(page, SUBJECT_START);
  await page.locator('[data-testid="qa-change-time"]').click();
  await page.locator(`[data-testid="qa-time-option"][data-start-minute="${17 * 60}"]`).click();
  await page.locator('[data-testid="qa-back"]').click();
  await page.locator('[data-testid="qa-move-teacher"]').click();
  await page.locator('[data-testid="qa-teacher-option"][data-teacher-id="T2"]').click();
  await page.locator('[data-testid="qa-back"]').click();
  await page.locator('[data-testid="qa-remove"]').click();
  await page.locator('[data-testid="qa-back"]').click();
  await page.locator('[data-testid="qa-view-details"]').click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  expect(errors).toEqual([]);
});
