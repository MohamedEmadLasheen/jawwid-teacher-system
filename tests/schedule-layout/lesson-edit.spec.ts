import { test, expect, type Page } from '@playwright/test';

/**
 * The redesigned Lesson Details card: scheduling only, with an explicit scope.
 *
 * The risk this feature carries is touching more lessons than the admin
 * chose, so almost every test below asserts the exact set of lesson ids that
 * reached apply_schedule_change — recorded by the supabase stub — and not
 * merely that "a save happened".
 *
 * A slot is one weekday at one start minute, across ALL teachers. The
 * fixtures deliberately include lessons that are near-misses on every axis —
 * adjacent minute, other day, same student elsewhere, and an ended lesson
 * sitting in the slot — so "all in slot" has something to wrongly sweep up
 * if the rule ever drifts.
 */

/**
 * The slot under test: Sunday 10:00, every teacher.
 *   SUN-A (Teacher A / Student A)  <- the lesson being edited
 *   SUN-B (Teacher B / Student B)
 *   SUN-C (Teacher C / Student C)
 */
const SLOT = ['SUN-A', 'SUN-B', 'SUN-C'];

/** Everything that must NEVER be touched by a slot-scoped operation. */
const OUTSIDE = [
  'SUN-1030-D',  // same day, 30 minutes later
  'MON-1000-E',  // same minute, different day
  'TUE-1000-A',  // same student as the subject, different day
  'SUN-1400-A',  // same student and day, different time
  'SUN-ENDED',   // in the slot, but ended — history
];

async function open(page: Page, opts: { dir?: 'ltr' | 'rtl'; single?: boolean; mode?: 'create' } = {}) {
  const q = new URLSearchParams();
  q.set('dir', opts.dir ?? 'ltr');
  if (opts.single) q.set('slot', 'single');
  if (opts.mode) q.set('mode', opts.mode);
  await page.goto(`/tests/schedule-layout/lesson-edit.html?${q}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  if (!opts.mode) await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
  await page.evaluate(() => (window as any).__supabaseStub.reset());
}

const rpcCalls = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.rpcCalls as { fn: string; args: any }[]);
const tableOps = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.tableOps as { table: string; op: string }[]);
const setConflict = (page: Page, on: boolean) =>
  page.evaluate((v) => { (window as any).__supabaseStub.conflict = v; }, on);
/** Make the conflict check fail for exactly these lessons. */
const setConflictFor = (page: Page, lessonIds: string[]) =>
  page.evaluate((ids) => { (window as any).__supabaseStub.conflictLessonIds = ids; }, lessonIds);

/** Every apply_schedule_change issued, as {action, lessonId, payload}. */
async function applied(page: Page) {
  return (await rpcCalls(page))
    .filter((c) => c.fn === 'apply_schedule_change')
    .map((c) => ({
      action: c.args.p_action as string,
      lessonId: c.args.p_payload.lesson_id as string,
      payload: c.args.p_payload as Record<string, unknown>,
    }));
}

/** Picks an option in a Radix Select by its visible label. */
async function selectOption(page: Page, testId: string, label: string | RegExp) {
  await page.locator(`[data-testid="${testId}"]`).click();
  await page.getByRole('option', { name: label }).click();
}

async function chooseScope(page: Page, which: 'this' | 'slot') {
  await page.locator(`[data-testid="scope-${which}"]`).click();
}

// ---------------------------------------------------------------------------
// The card is scheduling-only
// ---------------------------------------------------------------------------

test('the card shows the lesson and nothing operational', async ({ page }) => {
  await open(page);

  const summary = page.locator('[data-testid="lesson-summary"]');
  await expect(summary).toContainText('Student A');
  await expect(summary).toContainText('Teacher A');
  await expect(summary).toContainText('Sunday');
  await expect(summary).toContainText('10:00 AM');
  await expect(summary).toContainText('10:30 AM');
  await expect(summary).toContainText('30 minutes');

  // The four scheduling fields, and a separated removal section.
  for (const id of ['edit-teacher', 'edit-day', 'edit-time', 'edit-duration', 'delete-section']) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
  }

  // Everything the redesign removed must be gone from this card.
  const body = await page.locator('[data-testid="lesson-edit"]').innerText();
  for (const gone of [
    'Record Session', 'Present', 'Make-up', 'Sick', 'No Answer',
    'Parent Requested Reschedule', 'Technical Issue', 'Teacher Excused', 'Other',
    'Preservation', 'End Lesson', 'Add Student', 'Participants',
  ]) {
    expect(body, `"${gone}" should not be on the scheduling card`).not.toContain(gone);
  }
});

test('opening the card writes nothing', async ({ page }) => {
  await open(page);
  expect(await applied(page)).toHaveLength(0);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Scope is explicit — nothing saves without it
// ---------------------------------------------------------------------------

test('Save is unavailable until a field changes AND a scope is chosen', async ({ page }) => {
  await open(page);
  const save = page.locator('[data-testid="save-changes"]');

  // Untouched: nothing to save, and no scope question yet.
  await expect(save).toBeDisabled();
  expect(await page.locator('[data-testid="edit-scope"]').count()).toBe(0);

  await selectOption(page, 'edit-duration', '60 minutes');

  // Changed but unscoped: the question appears, Save stays disabled.
  await expect(page.locator('[data-testid="edit-scope"]')).toBeVisible();
  await expect(save).toBeDisabled();

  await chooseScope(page, 'this');
  await expect(save).toBeEnabled();
  expect(await applied(page), 'choosing a scope must not write').toHaveLength(0);
});

test('both scopes state exactly what they would touch', async ({ page }) => {
  await open(page);
  await selectOption(page, 'edit-duration', '60 minutes');

  const scope = page.locator('[data-testid="edit-scope"]');
  await expect(scope).toContainText('This lesson only');
  await expect(scope).toContainText('All lessons in the same time slot');
  // The slot is named by day, time, count and the teachers in it.
  await expect(scope).toContainText('3 lessons');
  await expect(scope).toContainText('Sunday');
  await expect(scope).toContainText('10:00 AM');
  await expect(scope).toContainText('Teacher A');
  await expect(scope).toContainText('Teacher B');
  await expect(scope).toContainText('Teacher C');
});

test('with no siblings the wider scope is offered but disabled, and says why', async ({ page }) => {
  await open(page, { single: true });
  await selectOption(page, 'edit-duration', '60 minutes');
  await expect(page.locator('[data-testid="scope-slot"]')).toBeDisabled();
  await expect(page.locator('[data-testid="scope-slot-note"]'))
    .toContainText('only lesson in this time slot');
});

// ---------------------------------------------------------------------------
// A–H — each field, each scope
// ---------------------------------------------------------------------------

const FIELD_CASES = [
  // Teacher is single-scope only: moving a whole slot onto ONE teacher is a
  // teacher collision by construction, and has its own blocking test below.
  { key: 'time', testId: 'edit-time', label: '11:00 AM', payloadKey: 'new_start_minute', expected: 11 * 60, bulk: true },
  { key: 'duration', testId: 'edit-duration', label: '60 minutes', payloadKey: 'new_duration_minutes', expected: 60, bulk: true },
  { key: 'teacher', testId: 'edit-teacher', label: 'Teacher Z', payloadKey: 'new_teacher_id', expected: 'TZ', bulk: false },
] as const;

for (const field of FIELD_CASES) {
  test(`edit ${field.key} — this lesson only touches exactly one lesson`, async ({ page }) => {
    await open(page);
    await setConflict(page, false);
    await selectOption(page, field.testId, field.label);
    await chooseScope(page, 'this');
    await page.locator('[data-testid="save-changes"]').click();

    await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '1');
    const writes = await applied(page);
    expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
    expect(writes[0].action).toBe('move_lesson');
    expect(writes[0].payload[field.payloadKey]).toBe(field.expected);
    // Permanent edit of the lesson record, not a dated exception.
    expect(writes[0].payload.scope).toBe('all_future');
    expect(writes[0].payload.occurrence_date).toBeUndefined();
  });

  if (!field.bulk) continue;

  test(`edit ${field.key} — all in slot touches the slot and nothing else`, async ({ page }) => {
    await open(page);
    await setConflict(page, false);
    await selectOption(page, field.testId, field.label);
    await chooseScope(page, 'slot');
    await page.locator('[data-testid="save-changes"]').click();

    await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '1');
    const writes = await applied(page);
    expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
    for (const w of writes) {
      expect(w.action).toBe('move_lesson');
      expect(w.payload[field.payloadKey]).toBe(field.expected);
    }
    // Nothing outside the slot may be touched.
    for (const other of OUTSIDE) {
      expect(writes.map((w) => w.lessonId), `${other} must be outside the slot`).not.toContain(other);
    }
  });
}

test('edit day — this lesson only', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-day', 'Wednesday');
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
  expect(writes[0].payload.new_day_of_week).toBe(3);
});

test('edit day — all in slot moves the whole slot together', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-day', 'Wednesday');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
  for (const w of writes) expect(w.payload.new_day_of_week).toBe(3);
  for (const other of OUTSIDE) expect(writes.map((w) => w.lessonId)).not.toContain(other);
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

test('a conflict blocks the save and names the day it was found on', async ({ page }) => {
  await open(page);
  await setConflict(page, true);
  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const verdict = page.locator('[data-testid="edit-verdict"]');
  await expect(verdict).toHaveAttribute('data-ok', 'false');
  await expect(verdict).toContainText('Blocked');
  await expect(verdict).toContainText('Sunday');
  await expect(verdict).toContainText('Nothing was changed');
  // Checked before writing, so nothing was applied.
  expect(await applied(page)).toHaveLength(0);
});

test('every lesson in scope is checked before any is written', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const calls = await rpcCalls(page);
  const checks = calls.filter((c) => c.fn === 'check_schedule_conflict');
  const writes = calls.filter((c) => c.fn === 'apply_schedule_change');
  expect(checks.length).toBe(SLOT.length);
  // Ordering: the last check precedes the first write.
  expect(calls.indexOf(checks[checks.length - 1])).toBeLessThan(calls.indexOf(writes[0]));
  expect(checks.map((c) => c.args.p_exclude_lesson_id).sort()).toEqual([...SLOT].sort());
});

test('a conflict on the THIRD target leaves the first two untouched', async ({ page }) => {
  // The decisive no-partial-apply case: preflight validates the whole batch,
  // so a problem on any member means zero writes — not two writes and a stop.
  await open(page);
  await setConflictFor(page, ['SUN-C']);

  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  await expect(page.locator('[data-testid="edit-verdict"]')).toHaveAttribute('data-ok', 'false');
  const writes = await applied(page);
  expect(writes, 'no lesson may be written when any target fails').toHaveLength(0);
  for (const id of SLOT) expect(writes.map((w) => w.lessonId)).not.toContain(id);
  // The card stays open with the change still pending, so it can be fixed.
  await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '0');
});

test('moving the whole slot onto one teacher is blocked before any write', async ({ page }) => {
  // Every lesson in a slot is at the same day and minute, so giving them all
  // the same teacher is a teacher collision by construction. Each individual
  // conflict check would pass (Teacher Z is free), which is exactly why the
  // batch is also simulated against itself.
  await open(page);
  await setConflict(page, false);

  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const verdict = page.locator('[data-testid="edit-verdict"]');
  await expect(verdict).toHaveAttribute('data-ok', 'false');
  await expect(verdict).toContainText('Teacher Z');
  await expect(verdict).toContainText('Nothing was changed');
  expect(await applied(page)).toHaveLength(0);
});

test('the same teacher change IS allowed for a single lesson', async ({ page }) => {
  // The collision only exists across the batch; one lesson alone is fine.
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
  expect(writes[0].payload.new_teacher_id).toBe('TZ');
});

test('the slot is resolved from the ORIGINAL day and time, not the destination', async ({ page }) => {
  // Moving the slot to Sunday 10:30 must act on the three lessons that were
  // at 10:00 — and must NOT pull in SUN-1030-D, which lives at the
  // destination. A set recomputed after the first write would catch it.
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-time', '10:30 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
  expect(writes.map((w) => w.lessonId)).not.toContain('SUN-1030-D');
  for (const w of writes) expect(w.payload.new_start_minute).toBe(10 * 60 + 30);
});

// ---------------------------------------------------------------------------
// I–J — removal
// ---------------------------------------------------------------------------

test('removal requires confirmation and states the consequence', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-this"]').click();

  const confirm = page.locator('[data-testid="delete-confirm"]');
  await expect(confirm).toBeVisible();
  await expect(page.locator('[data-testid="delete-confirm-body"]'))
    .toContainText('stops recurring from today forward');
  await expect(page.locator('[data-testid="delete-confirm-body"]'))
    .toContainText('No other lesson is affected');
  // Nothing has happened yet.
  expect(await applied(page)).toHaveLength(0);

  await page.locator('[data-testid="delete-cancel"]').click();
  await expect(confirm).toHaveCount(0);
  expect(await applied(page), 'cancelling must not write').toHaveLength(0);
  await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
});

test('delete this lesson only — end_lesson on exactly that lesson', async ({ page }) => {
  // The card acts on the RECURRING lesson record (the grid renders lessons
  // rows and only overlays this occurrence's exceptions), so removing it ends
  // the recurrence rather than cancelling a single date.
  await open(page);
  await page.locator('[data-testid="delete-this"]').click();
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
  expect(writes[0].action).toBe('end_lesson');
  // No sibling in the slot, and nothing outside it.
  for (const other of ['SUN-B', 'SUN-C', ...OUTSIDE]) {
    expect(writes.map((w) => w.lessonId)).not.toContain(other);
  }
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('delete all in slot — end_lesson on each, nothing outside the slot', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-slot"]').click();

  const body = page.locator('[data-testid="delete-confirm-body"]');
  await expect(body).toContainText('3 in total');
  await expect(body).toContainText('Sunday');
  await expect(body).toContainText('10:00 AM');
  await expect(body).toContainText('from today forward');
  // The teachers whose lessons are about to end are named.
  for (const name of ['Teacher A', 'Teacher B', 'Teacher C']) {
    await expect(body).toContainText(name);
  }
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
  for (const w of writes) expect(w.action).toBe('end_lesson');
  for (const other of OUTSIDE) expect(writes.map((w) => w.lessonId)).not.toContain(other);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('no path produces a hard delete or an unexpected action', async ({ page }) => {
  await open(page);
  await setConflict(page, false);

  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();
  await page.locator('[data-testid="reopen"]').click();
  await page.locator('[data-testid="delete-this"]').click();
  await page.locator('[data-testid="delete-confirm-action"]').click();
  await page.locator('[data-testid="reopen"]').click();
  await page.locator('[data-testid="delete-slot"]').click();
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const calls = await rpcCalls(page);
  expect([...new Set(calls.map((c) => c.fn))].sort())
    .toEqual(['apply_schedule_change', 'check_schedule_conflict']);
  expect([...new Set((await applied(page)).map((w) => w.action))].sort())
    .toEqual(['end_lesson', 'move_lesson']);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);

  const serialized = JSON.stringify(calls).toLowerCase();
  for (const forbidden of ['delete_lesson', 'drop ', 'alter table', 'truncate', 'remove_participant', 'cancel_occurrence']) {
    expect(serialized, `must not contain "${forbidden}"`).not.toContain(forbidden);
  }
});

// ---------------------------------------------------------------------------
// Create mode must be untouched by the edit-mode redesign
// ---------------------------------------------------------------------------

test('create mode still offers its own controls and creates a lesson', async ({ page }) => {
  await open(page, { mode: 'create' });

  const dialog = page.getByRole('dialog');
  // Create keeps the multi-day picker, course, duration and student picker —
  // none of which belong on the edit card.
  for (const label of ['Create Lesson', 'Teacher', 'Days', 'Course', 'Duration', 'Students']) {
    await expect(dialog).toContainText(label);
  }
  // All seven days are still offered.
  for (const day of ['Sunday', 'Wednesday', 'Saturday']) {
    await expect(dialog).toContainText(day);
  }
  // And it is NOT the scheduling edit card.
  expect(await page.locator('[data-testid="lesson-edit"]').count()).toBe(0);
  expect(await page.locator('[data-testid="edit-scope"]').count()).toBe(0);

  const create = dialog.getByRole('button', { name: 'Create Lesson' });
  // The existing guard holds: no students, no creation.
  await expect(create).toBeDisabled();

  // Pick a student through the real combobox.
  await dialog.getByRole('combobox').last().click();
  await page.getByRole('option', { name: 'Student A' }).click();
  await page.keyboard.press('Escape');

  await expect(create).toBeEnabled();
  await create.click();

  const writes = await applied(page);
  expect(writes.length).toBeGreaterThan(0);
  for (const w of writes) expect(w.action).toBe('create_lesson');
  expect(writes[0].payload.teacher_id).toBe('TA');
  expect(writes[0].payload.start_minute).toBe(10 * 60);
  expect(writes[0].payload.student_ids).toEqual(['SA']);
});

// ---------------------------------------------------------------------------
// Mobile + RTL
// ---------------------------------------------------------------------------

for (const vp of [{ w: 375, h: 812 }, { w: 390, h: 844 }] as const) {
  test(`@ ${vp.w}px: the card fits, scrolls, and keeps touch-sized controls`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await open(page);

    const geom = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="lesson-edit"]') as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        width: r.width, vw: window.innerWidth, height: r.height, vh: window.innerHeight,
        overflowY: getComputedStyle(el).overflowY,
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    expect(geom.width).toBeLessThanOrEqual(geom.vw);
    expect(geom.height).toBeLessThanOrEqual(geom.vh);
    expect(geom.overflowY).toBe('auto');
    // No horizontal layout break.
    expect(geom.docScrollW).toBeLessThanOrEqual(geom.clientW + 1);

    for (const id of ['edit-teacher', 'edit-day', 'edit-time', 'edit-duration', 'delete-this', 'save-changes']) {
      const h = await page.locator(`[data-testid="${id}"]`).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${id} height`).toBeGreaterThanOrEqual(36);
    }
  });
}

test('dir=rtl: the card renders right-to-left with Arabic labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, { dir: 'rtl' });

  const card = page.locator('[data-testid="lesson-edit"]');
  expect(await card.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  await expect(card).toContainText('تفاصيل الحصة');
  await expect(card).toContainText('تعديل الحصة');
  await expect(card).toContainText('إزالة من الجدول');

  await selectOption(page, 'edit-duration', '60 دقيقة');
  await expect(page.locator('[data-testid="edit-scope"]')).toContainText('هذه الحصة فقط');
  await expect(page.locator('[data-testid="edit-scope"]')).toContainText('كل الحصص في نفس التوقيت');

  const docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  expect(docScrollW).toBeLessThanOrEqual(clientW + 1);
});
