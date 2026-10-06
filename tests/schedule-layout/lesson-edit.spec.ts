import { test, expect, type Page } from '@playwright/test';

/**
 * The redesigned Lesson Details card: scheduling only, with an explicit scope.
 *
 * CANONICAL CONTRACT under test:
 *   Same time slot = same original day_of_week
 *                  + same original start_minute
 *                  + across all live teachers.
 *
 * The risk this feature carries is touching more lessons than the admin
 * chose, so almost every test below asserts the exact set of lesson ids that
 * reached apply_schedule_change — recorded by the supabase stub — and not
 * merely that "a save happened". The fixtures include a near-miss on every
 * axis (adjacent minute, other day, the same student elsewhere, and an ended
 * lesson sitting in the slot) so a drifting rule has something to wrongly
 * sweep up.
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

async function open(
  page: Page,
  opts: {
    dir?: 'ltr' | 'rtl'; single?: boolean; mode?: 'create';
    slowSlot?: boolean; anchor?: 'group';
  } = {}
) {
  const q = new URLSearchParams();
  q.set('dir', opts.dir ?? 'ltr');
  if (opts.single) q.set('slot', 'single');
  if (opts.slowSlot) q.set('slot', 'slow');
  if (opts.mode) q.set('mode', opts.mode);
  if (opts.anchor) q.set('anchor', opts.anchor);
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
// STUDENT WEEKLY SCHEDULE — A through L
// ---------------------------------------------------------------------------

/** The weekly rows as rendered, in order. */
const weeklyRows = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="weekly-row"]')).map((el) => {
      const e = el as HTMLElement;
      return {
        id: e.dataset.lessonId,
        selected: e.dataset.selected === 'true',
        current: e.dataset.current === 'true',
        cancelled: e.dataset.cancelled === 'true',
        rescheduled: e.dataset.rescheduled === 'true',
        text: (e.innerText ?? '').replace(/\s+/g, ' ').trim(),
      };
    })
  );

test('A: opening a lesson shows the student\'s complete live weekly schedule', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-testid="student-weekly"]')).toBeVisible();
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);

  const rows = await weeklyRows(page);
  // Student A's live lessons, sorted by weekday then start minute.
  expect(rows.map((r) => r.id)).toEqual(['SUN-A', 'SUN-1400-A', 'TUE-1000-A', 'WED-A', 'GROUP-AB']);
  // Stored recurring values are what each row shows.
  expect(rows[0].text).toContain('10:00 AM');
  expect(rows[3].text).toContain('11:00 AM');
});

test('B: lessons belonging to other students never appear', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
  const ids = (await weeklyRows(page)).map((r) => r.id);
  // SUN-B / SUN-C share the slot but belong to other students.
  for (const foreign of ['SUN-B', 'SUN-C', 'SUN-1030-D', 'MON-1000-E']) {
    expect(ids, `${foreign} is not Student A's`).not.toContain(foreign);
  }
});

test('C: ended lessons never appear', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
  const ids = (await weeklyRows(page)).map((r) => r.id);
  expect(ids).not.toContain('WEEK-ENDED-A');
  expect(ids).not.toContain('SUN-ENDED');
});

test('D: the originally clicked lesson is marked CURRENT LESSON, by id', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
  const rows = await weeklyRows(page);
  const current = rows.filter((r) => r.current);
  expect(current.map((r) => r.id)).toEqual(['SUN-A']);
  await expect(page.locator('[data-testid="weekly-current-badge"]')).toHaveCount(1);
  // It is also the default edit target.
  expect(rows.find((r) => r.selected)?.id).toBe('SUN-A');
});

test('exception markers are dated and never alter the recurring row', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
  await expect(page.locator('[data-testid="weekly-cancelled"]')).toBeVisible();

  const rows = await weeklyRows(page);
  const cancelled = rows.find((r) => r.id === 'SUN-1400-A')!;
  const rescheduled = rows.find((r) => r.id === 'WED-A')!;

  expect(cancelled.cancelled).toBe(true);
  expect(cancelled.text).toMatch(/Cancelled on \w/);
  // The recurring time is unchanged by the cancellation.
  expect(cancelled.text).toContain('2:00 PM');

  expect(rescheduled.rescheduled).toBe(true);
  expect(rescheduled.text).toMatch(/Rescheduled on \w/);
  // Stored 11:00 still shown as the schedule; the override named separately.
  expect(rescheduled.text).toContain('11:00 AM');
  expect(rescheduled.text).toContain('that date only: 1:00 PM');
});

test('E: selecting another weekly lesson moves the edit target', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);

  await expect(page.locator('[data-testid="editing-target"]')).toContainText('Sunday');
  await page.locator('[data-testid="weekly-row"][data-lesson-id="TUE-1000-A"]').click();

  const editing = page.locator('[data-testid="editing-target"]');
  await expect(editing).toContainText('Tuesday');
  await expect(editing).toContainText('10:00 AM');
  // Fields reset to that lesson's stored values; nothing is dirty yet.
  await expect(page.locator('[data-testid="edit-day"]')).toContainText('Tuesday');
  await expect(page.locator('[data-testid="save-changes"]')).toBeDisabled();
  // CURRENT LESSON still marks the originally clicked one.
  const rows = await weeklyRows(page);
  expect(rows.find((r) => r.current)?.id).toBe('SUN-A');
  expect(rows.find((r) => r.selected)?.id).toBe('TUE-1000-A');
});

test('F+G: editing the selected lesson changes ONLY that lesson', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);

  await page.locator('[data-testid="weekly-row"][data-lesson-id="TUE-1000-A"]').click();
  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['TUE-1000-A']);
  expect(writes[0].payload.new_start_minute).toBe(11 * 60);
  // Sunday and Wednesday are untouched.
  for (const sibling of ['SUN-A', 'SUN-1400-A', 'WED-A', 'GROUP-AB']) {
    expect(writes.map((w) => w.lessonId)).not.toContain(sibling);
  }
});

test('H: teacher, day, time and duration each edit the selected lesson', async ({ page }) => {
  const cases = [
    { id: 'edit-teacher', label: 'Teacher Z', key: 'new_teacher_id', value: 'TZ' },
    { id: 'edit-day', label: 'Friday', key: 'new_day_of_week', value: 5 },
    { id: 'edit-time', label: '11:30 AM', key: 'new_start_minute', value: 11 * 60 + 30 },
    { id: 'edit-duration', label: '90 minutes', key: 'new_duration_minutes', value: 90 },
  ] as const;

  for (const c of cases) {
    await open(page);
    await setConflict(page, false);
    await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
    await page.locator('[data-testid="weekly-row"][data-lesson-id="WED-A"]').click();
    await selectOption(page, c.id, c.label);
    await chooseScope(page, 'this');
    await page.locator('[data-testid="save-changes"]').click();

    const writes = await applied(page);
    expect(writes.map((w) => w.lessonId), `${c.id} target`).toEqual(['WED-A']);
    expect(writes[0].payload[c.key], `${c.id} payload`).toBe(c.value);
  }
});

test('the slot scope re-resolves from the newly selected lesson', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);

  // SUN-A sits in the Sunday-10:00 slot with SUN-B and SUN-C.
  await selectOption(page, 'edit-duration', '60 minutes');
  await expect(page.locator('[data-testid="scope-slot-note"]')).toContainText('3 lessons');

  // TUE-1000-A is alone in the Tuesday-10:00 slot.
  await page.locator('[data-testid="weekly-row"][data-lesson-id="TUE-1000-A"]').click();
  await selectOption(page, 'edit-duration', '60 minutes');
  await expect(page.locator('[data-testid="scope-slot-note"]'))
    .toHaveAttribute('data-blocked', 'only_one');
});

test('group lesson: no student is chosen for you', async ({ page }) => {
  await open(page, { anchor: 'group' });
  await expect(page.locator('[data-testid="student-switcher"]')).toBeVisible();
  // Two chips, neither selected, and no schedule claimed yet.
  await expect(page.locator('[data-testid="student-chip"]')).toHaveCount(2);
  expect(await page.locator('[data-testid="student-chip"][data-selected="true"]').count()).toBe(0);
  await expect(page.locator('[data-testid="weekly-choose-student"]')).toBeVisible();
  expect(await page.locator('[data-testid="weekly-row"]').count()).toBe(0);

  // Choosing a student shows that student's schedule only.
  await page.locator('[data-testid="student-chip"][data-student-id="SA"]').click();
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);
  expect((await weeklyRows(page)).map((r) => r.id)).toContain('TUE-1000-A');

  // Switching to the other student swaps the schedule entirely.
  await page.locator('[data-testid="student-chip"][data-student-id="SB"]').click();
  await expect.poll(async () => (await weeklyRows(page)).map((r) => r.id))
    .not.toContain('TUE-1000-A');
});

test('Add Lesson creates exactly one recurring lesson for the selected student', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await expect.poll(async () => (await weeklyRows(page)).length).toBeGreaterThan(0);

  await page.locator('[data-testid="weekly-add-open"]').click();
  await selectOption(page, 'add-teacher', 'Teacher B');
  await selectOption(page, 'add-day', 'Saturday');
  await selectOption(page, 'add-time', '9:00 AM');
  await selectOption(page, 'add-duration', '60 minutes');
  await page.locator('[data-testid="weekly-add-confirm"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.action)).toEqual(['create_lesson']);
  const p = writes[0].payload;
  expect(p.teacher_id).toBe('TB');
  expect(p.day_of_week).toBe(6);
  expect(p.start_minute).toBe(9 * 60);
  expect(p.duration_minutes).toBe(60);
  expect(p.student_ids).toEqual(['SA']);
  // One lesson, one day — no replication across the schedule.
  expect(writes).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// FINDING #1 — no claim about the slot until the slot query has resolved
// ---------------------------------------------------------------------------

test('while the slot is loading the card makes no claim about membership', async ({ page }) => {
  await open(page, { slowSlot: true });
  await selectOption(page, 'edit-duration', '60 minutes');

  const note = page.locator('[data-testid="scope-slot-note"]');
  const slotRadio = page.locator('[data-testid="scope-slot"]');
  const deleteSlot = page.locator('[data-testid="delete-slot"]');

  // 1 — the query really is in flight.
  await expect(note).toHaveAttribute('data-blocked', 'loading');

  // 2 — it must not say the lesson is alone.
  await expect(note).not.toContainText('only lesson');
  await expect(note).toContainText('Loading lessons in this time slot');

  // 3 — and must not show any count, right or wrong.
  const loadingText = `${await note.innerText()} ${await deleteSlot.innerText()}`;
  expect(loadingText, 'no lesson count may appear while loading').not.toMatch(/\b\d+\b/);
  // 3b — nor a teacher list.
  for (const name of ['Teacher A', 'Teacher B', 'Teacher C']) {
    expect(loadingText).not.toContain(name);
  }

  // 4 + bulk delete — neither can be chosen.
  await expect(slotRadio).toBeDisabled();
  await expect(deleteSlot).toBeDisabled();

  // "This lesson only" stays usable throughout.
  await expect(page.locator('[data-testid="scope-this"]')).toBeEnabled();

  // 5 — once it resolves, the authoritative answer appears.
  await expect(note).toHaveAttribute('data-blocked', '', { timeout: 10_000 });
  await expect(note).toContainText('3 lessons');
  for (const name of ['Teacher A', 'Teacher B', 'Teacher C']) {
    await expect(note).toContainText(name);
  }
  await expect(deleteSlot).toContainText('3');

  // 6 — and the bulk scope becomes available with the right target set.
  await expect(slotRadio).toBeEnabled();
  await expect(deleteSlot).toBeEnabled();
  await setConflict(page, false);
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();
  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
  for (const other of OUTSIDE) expect(writes.map((w) => w.lessonId)).not.toContain(other);
});

test('a lesson genuinely alone in its slot still says so, once known', async ({ page }) => {
  // The loading state must not swallow the real "only one" case.
  await open(page, { single: true });
  await selectOption(page, 'edit-duration', '60 minutes');
  const note = page.locator('[data-testid="scope-slot-note"]');
  await expect(note).toHaveAttribute('data-blocked', 'only_one');
  await expect(note).toContainText('only lesson in this time slot');
  await expect(page.locator('[data-testid="scope-slot"]')).toBeDisabled();
});

// ---------------------------------------------------------------------------
// FINDING #2 — a failed preflight disables Save until something changes
// ---------------------------------------------------------------------------

test('A: a blocked preflight writes nothing and disables Save', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');   // whole slot onto one teacher
  await chooseScope(page, 'slot');

  const save = page.locator('[data-testid="save-changes"]');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.locator('[data-testid="edit-verdict"]')).toHaveAttribute('data-ok', 'false');
  await expect(save).toBeDisabled();
  expect(await applied(page)).toHaveLength(0);
});

test('B: clicking Save repeatedly on the same invalid state still writes nothing', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  for (let i = 0; i < 3; i++) {
    await page.locator('[data-testid="save-changes"]').click({ force: true });
  }
  // The message stays up and nothing was written.
  await expect(page.locator('[data-testid="edit-verdict"]')).toHaveAttribute('data-ok', 'false');
  expect(await applied(page)).toHaveLength(0);
});

test('C: changing the offending field clears the block and re-enables Save', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();
  await expect(page.locator('[data-testid="save-changes"]')).toBeDisabled();

  // Change the field that caused it.
  await selectOption(page, 'edit-teacher', 'Teacher A');
  expect(await page.locator('[data-testid="edit-verdict"]').count(),
    'the stale verdict must be cleared').toBe(0);
  // Still dirty (duration/day/time unchanged, teacher back to original) —
  // so change something real and confirm Save is usable again.
  await selectOption(page, 'edit-duration', '60 minutes');
  await expect(page.locator('[data-testid="save-changes"]')).toBeEnabled();
});

test('C2: changing the SCOPE also clears the block', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();
  await expect(page.locator('[data-testid="save-changes"]')).toBeDisabled();

  await chooseScope(page, 'this');
  expect(await page.locator('[data-testid="edit-verdict"]').count()).toBe(0);
  await expect(page.locator('[data-testid="save-changes"]')).toBeEnabled();
});

test('D: correcting the conflict then saving works', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-teacher', 'Teacher Z');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();
  await expect(page.locator('[data-testid="save-changes"]')).toBeDisabled();
  expect(await applied(page)).toHaveLength(0);

  // Narrow to a single lesson — the collision only existed across the batch.
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '1');
  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
  expect(writes[0].payload.new_teacher_id).toBe('TZ');
});

// ---------------------------------------------------------------------------
// The payload must carry ONLY what the admin changed
// ---------------------------------------------------------------------------

const SINGLE_FIELD_CASES = [
  { key: 'teacher',  testId: 'edit-teacher',  label: 'Teacher Z',  sent: 'new_teacher_id',       value: 'TZ' },
  { key: 'day',      testId: 'edit-day',      label: 'Wednesday',  sent: 'new_day_of_week',      value: 3 },
  { key: 'time',     testId: 'edit-time',     label: '11:00 AM',   sent: 'new_start_minute',     value: 11 * 60 },
  { key: 'duration', testId: 'edit-duration', label: '60 minutes', sent: 'new_duration_minutes', value: 60 },
] as const;

const ALL_FIELDS = ['new_teacher_id', 'new_day_of_week', 'new_start_minute', 'new_duration_minutes'] as const;

for (const field of SINGLE_FIELD_CASES) {
  test(`changing only ${field.key} sends only ${field.key}`, async ({ page }) => {
    // The preflight projection and the move_lesson payload must agree, and
    // both must leave untouched fields alone: changing a duration must not
    // implicitly restate a teacher, which on a multi-teacher slot would both
    // invent a collision and validate the wrong teacher.
    await open(page);
    await setConflict(page, false);
    await selectOption(page, field.testId, field.label);
    await chooseScope(page, 'this');
    await page.locator('[data-testid="save-changes"]').click();

    const writes = await applied(page);
    expect(writes).toHaveLength(1);
    expect(writes[0].payload[field.sent]).toBe(field.value);

    for (const other of ALL_FIELDS) {
      if (other === field.sent) continue;
      expect(writes[0].payload[other], `${other} must not be sent when only ${field.key} changed`)
        .toBeUndefined();
    }
  });
}

test('the conflict check for each target uses that target\'s own unchanged fields', async ({ page }) => {
  // Changing only the duration across a slot of three different teachers must
  // check each lesson against ITS OWN teacher, not the subject's.
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-duration', '60 minutes');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const checks = (await rpcCalls(page)).filter((c) => c.fn === 'check_schedule_conflict');
  expect(checks.length).toBe(SLOT.length);
  const byLesson = new Map(checks.map((c) => [c.args.p_exclude_lesson_id, c.args]));
  expect(byLesson.get('SUN-A')!.p_teacher_id).toBe('TA');
  expect(byLesson.get('SUN-B')!.p_teacher_id).toBe('TB');
  expect(byLesson.get('SUN-C')!.p_teacher_id).toBe('TC');
  // And every one carries the new duration.
  for (const args of byLesson.values()) expect(args.p_duration_minutes).toBe(60);
});

// ---------------------------------------------------------------------------
// I–J — removal
// ---------------------------------------------------------------------------

test('removal requires confirmation and states the consequence', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-this"]').click();

  const confirm = page.locator('[data-testid="delete-confirm"]');
  await expect(confirm).toBeVisible();
  // Every statement the single-delete confirmation must make.
  const body = page.locator('[data-testid="delete-confirm-body"]');
  await expect(body).toContainText('1 recurring lesson will be ended');  // the count
  await expect(body).toContainText('recurring');                        // what it is
  await expect(body).toContainText('Sunday');                           // which one
  await expect(body).toContainText('10:00 AM');
  await expect(body).toContainText('Teacher A');
  await expect(body).toContainText('stops repeating from today forward');
  await expect(body).toContainText('end-of-lesson lifecycle');           // the mechanism
  await expect(body).toContainText('No database row is deleted');        // not a delete
  await expect(body).toContainText('historical records are preserved');
  await expect(body).toContainText('No other lesson is affected');
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

  // Every statement the bulk-delete confirmation must make.
  const body = page.locator('[data-testid="delete-confirm-body"]');
  await expect(body).toContainText('3 recurring lessons will be ended');  // exact count
  await expect(body).toContainText('Sunday');                            // original day
  await expect(body).toContainText('10:00 AM');                          // original time
  await expect(body).toContainText('across all teachers');               // scope is all teachers
  await expect(body).toContainText('stop repeating from today forward');
  await expect(body).toContainText('end-of-lesson lifecycle');
  await expect(body).toContainText('No database rows are physically deleted');
  await expect(body).toContainText('historical records are preserved');
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

test('deleting a recurring lesson ENDS it — never cancels one occurrence, row survives', async ({ page }) => {
  /**
   * The specific regression this guards: the card renders a recurring lessons
   * row, so a "delete" that wrote a dated lesson_exceptions row would hide
   * one date while the weekly lesson silently kept running. It must be a
   * lifecycle end, and the row must still be there afterwards.
   */
  await open(page);

  const rowsBefore = await page.evaluate(() =>
    ((window as any).__supabaseStub.tables.lessons as { id: string }[]).map((r) => r.id)
  );
  expect(rowsBefore).toContain('SUN-A');

  await page.locator('[data-testid="delete-this"]').click();
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.action)).toEqual(['end_lesson']);
  expect(writes[0].lessonId).toBe('SUN-A');
  // Explicitly NOT an occurrence cancellation.
  expect(writes.map((w) => w.action)).not.toContain('cancel_occurrence');
  expect(writes[0].payload.occurrence_date).toBeUndefined();

  // No DELETE reached any table, and the lesson row is still present.
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
  const rowsAfter = await page.evaluate(() =>
    ((window as any).__supabaseStub.tables.lessons as { id: string }[]).map((r) => r.id)
  );
  expect(rowsAfter).toEqual(rowsBefore);
  expect(rowsAfter).toContain('SUN-A');
});

test('a mid-batch failure stops at once, reports it, and reconciles the schedule', async ({ page }) => {
  /**
   * Preflight passes, then a write fails — the only way a partial update can
   * happen without a backend transaction. The run must stop immediately, name
   * the failed lesson, say how many were applied, state that it was not
   * atomic, and re-read the schedule so the screen matches the database.
   */
  await open(page);
  await setConflict(page, false);
  // Let preflight through, then make the THIRD write throw.
  await page.evaluate(() => {
    (window as any).__supabaseStub.failWriteForLessonIds = ['SUN-C'];
  });

  await selectOption(page, 'edit-time', '11:00 AM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const outcome = page.locator('[data-testid="edit-outcome"]');
  await expect(outcome).toBeVisible();
  await expect(outcome).toContainText('SUN-C');            // which lesson failed
  await expect(outcome).toContainText('2 of 3');           // how many applied
  await expect(outcome).toContainText('not atomic');       // no false claim

  // It stopped: only the first two were attempted, the third failed, and
  // nothing after it ran.
  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A', 'SUN-B', 'SUN-C']);

  // The card stays open with the message visible — nothing overwrites it.
  await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '0');

  // And the schedule was re-read so the UI reflects the real state.
  const refetched = await page.evaluate(() =>
    ((window as any).__supabaseStub.tableOps as { table: string }[])
      .some((o) => o.table === 'lessons')
  );
  expect(refetched, 'the schedule should be re-read after a partial failure').toBe(true);
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

/* ============================================================================
 * Searchable selectors, through the REAL card
 * ==========================================================================*/

/** The search field inside whichever selector is currently open. */
const editSearch = (page: Page) => page.locator('[cmdk-input]');

test('the teacher selector searches by partial name and still applies the pick', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="edit-teacher"]').click();
  await editSearch(page).fill('Z');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Teacher Z' }).click();
  await expect(page.locator('[data-testid="edit-teacher"]')).toContainText('Teacher Z');
});

test('the teacher search is case-insensitive and trims the query', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="edit-teacher"]').click();
  await editSearch(page).fill('  teacher z  ');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option').first()).toContainText('Teacher Z');
});

test('a teacher search with no match shows the empty state', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="edit-teacher"]').click();
  await editSearch(page).fill('Nobody');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(page.locator('[data-testid="searchable-select-empty"]')).toBeVisible();
});

/**
 * Start Time is formatted for reading ("1:00 PM") but people type times in
 * several ways. Each of these must reach the right column.
 */
const TIME_QUERIES: Array<{ query: string; expect: string }> = [
  { query: '08', expect: '8:00 AM' },     // leading zero — absent from the label
  { query: '08:00', expect: '8:00 AM' },  // 24-hour, zero-padded
  { query: '8:00 AM', expect: '8:00 AM' },// exactly as displayed
  { query: '13:00', expect: '1:00 PM' },  // 24-hour afternoon
  { query: '11:30', expect: '11:30 AM' },
];

for (const q of TIME_QUERIES) {
  test(`start time is findable by typing "${q.query}"`, async ({ page }) => {
    await open(page);
    await page.locator('[data-testid="edit-time"]').click();
    await editSearch(page).fill(q.query);
    await expect(page.getByRole('option', { name: q.expect, exact: true })).toHaveCount(1);
  });
}

test('typing PM narrows the start times to the afternoon only', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="edit-time"]').click();
  await editSearch(page).fill('PM');
  const labels = await page.getByRole('option').allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every((l) => l.includes('PM'))).toBe(true);
});

test('searching a start time and picking it sends that start minute', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await page.locator('[data-testid="edit-time"]').click();
  await editSearch(page).fill('11:00');
  await page.getByRole('option', { name: '11:00 AM', exact: true }).click();
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '1');
  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['SUN-A']);
  expect(writes[0].payload.new_start_minute).toBe(11 * 60);
});

test('the day selector is searchable and still sends the chosen day', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await page.locator('[data-testid="edit-day"]').click();
  await editSearch(page).fill('Wed');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Wednesday' }).click();
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  await expect(page.locator('[data-testid="fixtures"]')).toHaveAttribute('data-saved', '1');
  const writes = await applied(page);
  expect(writes[0].payload.new_day_of_week).toBe(3);
});

test('duration stays a plain select — four options, no search field', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="edit-duration"]').click();
  await expect(page.getByRole('option')).toHaveCount(4);
  await expect(editSearch(page)).toHaveCount(0);
});
