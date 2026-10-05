import { test, expect, type Page } from '@playwright/test';

/**
 * The redesigned Lesson Details card: scheduling only, with an explicit scope.
 *
 * The risk this feature carries is touching more lessons than the admin
 * chose, so almost every test below asserts the exact set of lesson ids that
 * reached apply_schedule_change — recorded by the supabase stub — and not
 * merely that "a save happened".
 *
 * Fixture slot: Ahmed's 3:00 PM pattern is L-SUN / L-TUE / L-THU. Three
 * decoys exist that must NEVER be touched: same student at a different
 * minute, a different student at the same minute, and an ended lesson in the
 * same slot.
 */

const SLOT = ['L-SUN', 'L-TUE', 'L-THU'];
const DECOYS = ['DECOY-TIME', 'DECOY-STUDENT', 'DECOY-ENDED'];

async function open(page: Page, opts: { dir?: 'ltr' | 'rtl'; single?: boolean } = {}) {
  const q = new URLSearchParams();
  q.set('dir', opts.dir ?? 'ltr');
  if (opts.single) q.set('slot', 'single');
  await page.goto(`/tests/schedule-layout/lesson-edit.html?${q}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
  await page.evaluate(() => (window as any).__supabaseStub.reset());
}

const rpcCalls = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.rpcCalls as { fn: string; args: any }[]);
const tableOps = (page: Page) =>
  page.evaluate(() => (window as any).__supabaseStub.tableOps as { table: string; op: string }[]);
const setConflict = (page: Page, on: boolean) =>
  page.evaluate((v) => { (window as any).__supabaseStub.conflict = v; }, on);

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
  await expect(summary).toContainText('Ahmed Mohamed');
  await expect(summary).toContainText('Mohamed Hussein');
  await expect(summary).toContainText('Sunday');
  await expect(summary).toContainText('3:00 PM');
  await expect(summary).toContainText('3:30 PM');
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

  await selectOption(page, 'edit-teacher', 'Rokaya Ramadan');

  // Changed but unscoped: the question appears, Save stays disabled.
  await expect(page.locator('[data-testid="edit-scope"]')).toBeVisible();
  await expect(save).toBeDisabled();

  await chooseScope(page, 'this');
  await expect(save).toBeEnabled();
  expect(await applied(page), 'choosing a scope must not write').toHaveLength(0);
});

test('both scopes state exactly what they would touch', async ({ page }) => {
  await open(page);
  await selectOption(page, 'edit-teacher', 'Rokaya Ramadan');

  const scope = page.locator('[data-testid="edit-scope"]');
  await expect(scope).toContainText('This lesson only');
  await expect(scope).toContainText('Sunday');
  await expect(scope).toContainText('All lessons in the same time slot');
  // The count and the days are named, so "all" is never a mystery.
  await expect(scope).toContainText('3 lessons');
  await expect(scope).toContainText('Tuesday');
  await expect(scope).toContainText('Thursday');
});

test('with no siblings the wider scope is offered but disabled, and says why', async ({ page }) => {
  await open(page, { single: true });
  await selectOption(page, 'edit-teacher', 'Rokaya Ramadan');
  await expect(page.locator('[data-testid="scope-slot"]')).toBeDisabled();
  await expect(page.locator('[data-testid="scope-slot-note"]'))
    .toContainText('only lesson in this time slot');
});

// ---------------------------------------------------------------------------
// A–H — each field, each scope
// ---------------------------------------------------------------------------

const FIELD_CASES = [
  { key: 'teacher', testId: 'edit-teacher', label: 'Rokaya Ramadan', payloadKey: 'new_teacher_id', expected: 'T2' },
  { key: 'time', testId: 'edit-time', label: '5:00 PM', payloadKey: 'new_start_minute', expected: 17 * 60 },
  { key: 'duration', testId: 'edit-duration', label: '60 minutes', payloadKey: 'new_duration_minutes', expected: 60 },
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
    expect(writes.map((w) => w.lessonId)).toEqual(['L-SUN']);
    expect(writes[0].action).toBe('move_lesson');
    expect(writes[0].payload[field.payloadKey]).toBe(field.expected);
    // Permanent edit of the lesson record, not a dated exception.
    expect(writes[0].payload.scope).toBe('all_future');
    expect(writes[0].payload.occurrence_date).toBeUndefined();
  });

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
    // The decoys must be untouched.
    for (const decoy of DECOYS) {
      expect(writes.map((w) => w.lessonId)).not.toContain(decoy);
    }
  });
}

test('edit day — this lesson only', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-day', 'Monday');
  await chooseScope(page, 'this');
  await page.locator('[data-testid="save-changes"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['L-SUN']);
  expect(writes[0].payload.new_day_of_week).toBe(1);
});

test('edit day — the wider scope is withdrawn, with the reason shown', async ({ page }) => {
  // A slot spans several days; moving all of them onto one day would collide
  // the same student with themselves. Rather than apply the day to one lesson
  // and silently skip the others, the option is withdrawn.
  await open(page);
  await selectOption(page, 'edit-day', 'Monday');

  await expect(page.locator('[data-testid="scope-slot"]')).toBeDisabled();
  await expect(page.locator('[data-testid="scope-slot-note"]'))
    .toHaveAttribute('data-blocked', 'day_changed');
  await expect(page.locator('[data-testid="scope-slot-note"]'))
    .toContainText('cannot all move to one day');
});

test('selecting the wider scope and THEN changing the day cannot save silently', async ({ page }) => {
  await open(page);
  await selectOption(page, 'edit-time', '5:00 PM');
  await chooseScope(page, 'slot');
  await expect(page.locator('[data-testid="save-changes"]')).toBeEnabled();

  // The day change invalidates the selected scope — Save must lock again
  // rather than quietly falling back to a different set of lessons.
  await selectOption(page, 'edit-day', 'Monday');
  await expect(page.locator('[data-testid="save-changes"]')).toBeDisabled();
  expect(await applied(page)).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

test('a conflict blocks the save and names the day it was found on', async ({ page }) => {
  await open(page);
  await setConflict(page, true);
  await selectOption(page, 'edit-time', '5:00 PM');
  await chooseScope(page, 'slot');
  await page.locator('[data-testid="save-changes"]').click();

  const verdict = page.locator('[data-testid="edit-verdict"]');
  await expect(verdict).toHaveAttribute('data-ok', 'false');
  await expect(verdict).toContainText('Conflict on');
  // Checked before writing, so nothing was applied.
  expect(await applied(page)).toHaveLength(0);
});

test('every lesson in scope is checked before any is written', async ({ page }) => {
  await open(page);
  await setConflict(page, false);
  await selectOption(page, 'edit-time', '5:00 PM');
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

// ---------------------------------------------------------------------------
// I–J — removal
// ---------------------------------------------------------------------------

test('removal requires confirmation and states the consequence', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-this"]').click();

  const confirm = page.locator('[data-testid="delete-confirm"]');
  await expect(confirm).toBeVisible();
  await expect(page.locator('[data-testid="delete-confirm-body"]'))
    .toContainText('cancels the occurrence');
  await expect(page.locator('[data-testid="delete-confirm-body"]'))
    .toContainText('nothing is deleted');
  // Nothing has happened yet.
  expect(await applied(page)).toHaveLength(0);

  await page.locator('[data-testid="delete-cancel"]').click();
  await expect(confirm).toHaveCount(0);
  expect(await applied(page), 'cancelling must not write').toHaveLength(0);
  await expect(page.locator('[data-testid="lesson-edit"]')).toBeVisible();
});

test('delete this lesson only — cancel_occurrence on one lesson', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-this"]').click();
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId)).toEqual(['L-SUN']);
  expect(writes[0].action).toBe('cancel_occurrence');
  expect(writes[0].payload.occurrence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('delete all in slot — end_lesson on each, decoys untouched', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="delete-slot"]').click();

  await expect(page.locator('[data-testid="delete-confirm-body"]')).toContainText('3 lessons');
  await expect(page.locator('[data-testid="delete-confirm-body"]')).toContainText('from today forward');
  await page.locator('[data-testid="delete-confirm-action"]').click();

  const writes = await applied(page);
  expect(writes.map((w) => w.lessonId).sort()).toEqual([...SLOT].sort());
  for (const w of writes) expect(w.action).toBe('end_lesson');
  for (const decoy of DECOYS) expect(writes.map((w) => w.lessonId)).not.toContain(decoy);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);
});

test('no path produces a hard delete or an unexpected action', async ({ page }) => {
  await open(page);
  await setConflict(page, false);

  await selectOption(page, 'edit-time', '5:00 PM');
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
    .toEqual(['cancel_occurrence', 'end_lesson', 'move_lesson']);
  expect((await tableOps(page)).filter((o) => o.op === 'delete')).toHaveLength(0);

  const serialized = JSON.stringify(calls).toLowerCase();
  for (const forbidden of ['delete_lesson', 'drop ', 'alter table', 'truncate', 'remove_participant']) {
    expect(serialized, `must not contain "${forbidden}"`).not.toContain(forbidden);
  }
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

  await selectOption(page, 'edit-teacher', 'Rokaya Ramadan');
  await expect(page.locator('[data-testid="edit-scope"]')).toContainText('هذه الحصة فقط');
  await expect(page.locator('[data-testid="edit-scope"]')).toContainText('كل الحصص في نفس التوقيت');

  const docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await page.evaluate(() => document.documentElement.clientWidth);
  expect(docScrollW).toBeLessThanOrEqual(clientW + 1);
});
