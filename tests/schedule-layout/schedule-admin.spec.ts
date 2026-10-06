import { test, expect, type Page } from '@playwright/test';

/**
 * RESPONSIBLE ADMIN IN THE SCHEDULE, in the real dialogs.
 *
 * The pure suite (scripts/schedule-geometry-tests/scheduleadmin.test.mjs)
 * proves the assignment rules. What it cannot prove is everything that only
 * exists once the real LessonDetailDialog is open and clicked:
 *
 *   * each selected student gets their OWN Admin row, prefilled from their
 *     record, with the Admin's colour dot;
 *   * an unassigned student blocks creation and says why;
 *   * creating writes `supervisor_id` to the STUDENT rows — and writes
 *     nothing at all for students who already had an Admin;
 *   * editing a lesson shows and changes the student's Admin, and every OTHER
 *     lesson for that student repaints, because no lesson stores a colour;
 *   * no write anywhere mentions a lesson-level admin.
 *
 * Fixtures only — the harness seeds React Query and stubs @/lib/supabase.
 */

type Fixtures = {
  dinaId: string; zainabId: string; rehabId: string; asmaaId: string;
  colors: Record<string, string>;
  adminNames: string[];
  arwaId: string; ahmedId: string; omarId: string;
  editedLessonId: string; otherLessonId: string;
};

type Write = { table: string; op: string; payload: Record<string, unknown>; filters: [string, unknown][] };

async function open(page: Page, opts: { dir?: 'ltr' | 'rtl'; mode?: 'create' | 'edit'; anchor?: string } = {}) {
  const q = new URLSearchParams({ dir: opts.dir ?? 'ltr', mode: opts.mode ?? 'create' });
  if (opts.anchor) q.set('anchor', opts.anchor);
  await page.goto(`/tests/schedule-layout/schedule-admin.html?${q}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  // The student list is fetched through the real service; wait for it.
  await page.waitForFunction(() => document.querySelectorAll('[data-testid$="-admin-panel"]').length >= 0);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => (window as any).__scheduleAdminFixtures as Fixtures);
}

const fixtures = (page: Page) => page.evaluate(() => (window as any).__scheduleAdminFixtures);
const studentsTable = (page: Page) =>
  page.evaluate(() => (window as any).__scheduleAdminFixtures.studentsTable()) as
    Promise<{ id: string; supervisor_id: string | null }[]>;
const writes = (page: Page) =>
  page.evaluate(() => (window as any).__scheduleAdminFixtures.writes()) as Promise<Write[]>;

/** Pick students in the Create dialog's participant multi-select. */
async function selectStudents(page: Page, names: string[]) {
  await page.locator('[data-testid="create-participants"]').click();
  for (const name of names) {
    await page.locator('[cmdk-item]').filter({ hasText: name }).first().click();
  }
  await page.keyboard.press('Escape');
}

/** Choose an Admin on one student's row. */
async function chooseAdmin(page: Page, prefix: string, studentId: string, adminName: string) {
  await page.locator(`[data-testid="${prefix}-admin-${studentId}"]`).click();
  await page.locator('[cmdk-item]').filter({ hasText: new RegExp(`^${adminName}$`) }).first().click();
}

const row = (page: Page, prefix: string, studentId: string) =>
  page.locator(`[data-testid="${prefix}-admin-row-${studentId}"]`);

const lessonColor = (page: Page, lessonId: string) =>
  page.locator(`[data-testid="lesson-card-${lessonId}"]`).getAttribute('data-supervisor-color');

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`create lesson · responsible Admin (${dir})`, () => {
    test('A · an already-assigned student is shown prefilled, with their colour', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Arwa Ahmed']);

      const arwa = row(page, 'create', f.arwaId);
      await expect(arwa).toHaveAttribute('data-admin-id', f.dinaId);
      await expect(arwa).toHaveAttribute('data-admin-color', f.colors[f.dinaId]);
      await expect(arwa).toHaveAttribute('data-missing', 'false');
      // The row carries two dots on purpose — the one beside the student's
      // name and the one inside the selected value — and both must read Dina.
      const dots = arwa.locator('[data-testid="supervisor-color-dot"]');
      await expect(dots).toHaveCount(2);
      await expect(dots.first()).toHaveAttribute('data-color', f.colors[f.dinaId]);
      await expect(dots.last()).toHaveAttribute('data-color', f.colors[f.dinaId]);
      await expect(page.locator(`[data-testid="create-admin-${f.arwaId}"]`)).toContainText('Dina');
    });

    test('A · creating keeps that student on Dina and writes no student row', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Arwa Ahmed']);
      await page.getByRole('button', { name: /create lesson|إنشاء حصة/i }).last().click();

      await expect.poll(() => page.evaluate(() => (window as any).__created === true)).toBe(true);

      // The existing assignment is preserved, and nothing was written for it.
      const table = await studentsTable(page);
      expect(table.find((s) => s.id === f.arwaId)?.supervisor_id).toBe(f.dinaId);
      expect(await writes(page)).toEqual([]);
    });

    test('B · an unassigned student is required and blocks creation', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Ahmed Mohamed']);

      const ahmed = row(page, 'create', f.ahmedId);
      await expect(ahmed).toHaveAttribute('data-missing', 'true');
      await expect(ahmed).toHaveAttribute('data-admin-id', '');

      await page.getByRole('button', { name: /create lesson|إنشاء حصة/i }).last().click();

      // Refused, explained, and nothing written or created.
      await expect(page.locator('[data-testid="create-admin-missing"]')).toBeVisible();
      await expect(page.locator(`[data-testid="create-admin-${f.ahmedId}-error"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="create-admin-${f.ahmedId}"]`))
        .toHaveAttribute('aria-invalid', 'true');
      expect(await writes(page)).toEqual([]);
      expect(await page.evaluate(() => (window as any).__created)).toBeUndefined();
    });

    test('B · choosing Rehab then creating writes supervisor_id on the student', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Ahmed Mohamed']);
      await chooseAdmin(page, 'create', f.ahmedId, 'Rehab');

      await expect(row(page, 'create', f.ahmedId)).toHaveAttribute('data-admin-id', f.rehabId);
      await expect(row(page, 'create', f.ahmedId))
        .toHaveAttribute('data-admin-color', f.colors[f.rehabId]);

      await page.getByRole('button', { name: /create lesson|إنشاء حصة/i }).last().click();
      await expect.poll(() => page.evaluate(() => (window as any).__created === true)).toBe(true);

      // Exactly one write: students.supervisor_id for that one student.
      const w = await writes(page);
      expect(w).toHaveLength(1);
      expect(w[0].table).toBe('students');
      expect(w[0].op).toBe('update');
      expect(w[0].payload).toEqual({ supervisor_id: f.rehabId });
      expect(w[0].filters).toEqual([['id', f.ahmedId]]);

      const table = await studentsTable(page);
      expect(table.find((s) => s.id === f.ahmedId)?.supervisor_id).toBe(f.rehabId);
    });

    test('D · several students keep their own Admins, independently', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Arwa Ahmed', 'Ahmed Mohamed', 'Omar Ali']);

      await expect(row(page, 'create', f.arwaId)).toHaveAttribute('data-admin-id', f.dinaId);
      await expect(row(page, 'create', f.omarId)).toHaveAttribute('data-admin-id', f.asmaaId);
      await expect(row(page, 'create', f.ahmedId)).toHaveAttribute('data-missing', 'true');

      // THE regression: choosing for one must not splash onto the others.
      await chooseAdmin(page, 'create', f.ahmedId, 'Zainab');
      await expect(row(page, 'create', f.ahmedId)).toHaveAttribute('data-admin-id', f.zainabId);
      await expect(row(page, 'create', f.arwaId)).toHaveAttribute('data-admin-id', f.dinaId);
      await expect(row(page, 'create', f.omarId)).toHaveAttribute('data-admin-id', f.asmaaId);

      await page.getByRole('button', { name: /create lesson|إنشاء حصة/i }).last().click();
      await expect.poll(() => page.evaluate(() => (window as any).__created === true)).toBe(true);

      // Only the student who actually changed was written.
      const w = await writes(page);
      expect(w.map((x) => [x.table, x.filters[0]?.[1], x.payload])).toEqual([
        ['students', f.ahmedId, { supervisor_id: f.zainabId }],
      ]);
      const table = await studentsTable(page);
      expect(table).toEqual([
        { id: f.arwaId, supervisor_id: f.dinaId },
        { id: f.ahmedId, supervisor_id: f.zainabId },
        { id: f.omarId, supervisor_id: f.asmaaId },
      ]);
    });

    test('E · no write anywhere carries a lesson-level admin', async ({ page }) => {
      const f = await open(page, { dir });
      await selectStudents(page, ['Ahmed Mohamed']);
      await chooseAdmin(page, 'create', f.ahmedId, 'Rehab');
      await page.getByRole('button', { name: /create lesson|إنشاء حصة/i }).last().click();
      await expect.poll(() => page.evaluate(() => (window as any).__created === true)).toBe(true);

      // No student write mentions a lesson or a colour…
      for (const w of await writes(page)) {
        expect(Object.keys(w.payload).filter((k) => /lesson|colou?r/i.test(k))).toEqual([]);
      }
      // …and the create_lesson payload carries no admin of its own.
      const rpcs = await page.evaluate(() => (window as any).__scheduleAdminFixtures.rpcCalls());
      const create = rpcs.find((c: any) => c.args?.p_action === 'create_lesson');
      expect(create).toBeTruthy();
      expect(
        Object.keys(create.args.p_payload).filter((k: string) => /supervisor|admin|colou?r/i.test(k))
      ).toEqual([]);
    });

    test('the picker shows each student\'s Admin colour while choosing', async ({ page }) => {
      const f = await open(page, { dir });
      await page.locator('[data-testid="create-participants"]').click();
      const arwaItem = page.locator('[cmdk-item]').filter({ hasText: 'Arwa Ahmed' }).first();
      await expect(arwaItem.locator('[data-testid="supervisor-color-dot"]'))
        .toHaveAttribute('data-color', f.colors[f.dinaId]);
      const ahmedItem = page.locator('[cmdk-item]').filter({ hasText: 'Ahmed Mohamed' }).first();
      await expect(ahmedItem.locator('[data-testid="supervisor-color-dot"]'))
        .toHaveAttribute('data-color', '');
    });
  });

  test.describe(`edit lesson · responsible Admin (${dir})`, () => {
    test('C · the lesson\'s students show their Admin, and it is editable', async ({ page }) => {
      const f = await open(page, { dir, mode: 'edit' });

      await expect(row(page, 'edit', f.arwaId)).toHaveAttribute('data-admin-id', f.dinaId);
      await expect(row(page, 'edit', f.omarId)).toHaveAttribute('data-admin-id', f.asmaaId);
      await expect(page.locator(`[data-testid="edit-admin-${f.arwaId}"]`)).toContainText('Dina');
    });

    test('C · Dina → Asmaa updates the student and repaints every other lesson', async ({ page }) => {
      const f = await open(page, { dir, mode: 'edit', anchor: 'single' });

      // Both lessons for Arwa start red, from her Admin — not from themselves.
      await expect.poll(() => lessonColor(page, f.editedLessonId)).toBe(f.colors[f.dinaId]);
      await expect.poll(() => lessonColor(page, f.otherLessonId)).toBe(f.colors[f.dinaId]);

      await chooseAdmin(page, 'edit', f.arwaId, 'Asmaa');
      await expect(page.locator('[data-testid="edit-admin-outcome"]')).toBeVisible();

      // One student-row write, exactly.
      const w = await writes(page);
      expect(w).toHaveLength(1);
      expect([w[0].table, w[0].op, w[0].payload, w[0].filters]).toEqual([
        'students', 'update', { supervisor_id: f.asmaaId }, [['id', f.arwaId]],
      ]);
      expect((await studentsTable(page)).find((s) => s.id === f.arwaId)?.supervisor_id)
        .toBe(f.asmaaId);

      // The edited lesson AND the student's other lesson both turn green.
      await expect.poll(() => lessonColor(page, f.editedLessonId)).toBe(f.colors[f.asmaaId]);
      await expect.poll(() => lessonColor(page, f.otherLessonId)).toBe(f.colors[f.asmaaId]);

      // Ownership is not a scheduling change: no lesson RPC was issued.
      const rpcs = await page.evaluate(() => (window as any).__scheduleAdminFixtures.rpcCalls());
      expect(rpcs.filter((c: any) => c.fn === 'apply_schedule_change')).toEqual([]);
    });

    test('C · changing one participant leaves the other alone', async ({ page }) => {
      const f = await open(page, { dir, mode: 'edit' });
      await chooseAdmin(page, 'edit', f.arwaId, 'Zainab');
      await expect(page.locator('[data-testid="edit-admin-outcome"]')).toBeVisible();

      await expect.poll(async () => (await studentsTable(page)).find((s) => s.id === f.arwaId)?.supervisor_id)
        .toBe(f.zainabId);
      expect((await studentsTable(page)).find((s) => s.id === f.omarId)?.supervisor_id)
        .toBe(f.asmaaId);
      await expect(row(page, 'edit', f.omarId)).toHaveAttribute('data-admin-id', f.asmaaId);
    });

    test('the panel says this is a student property, not a lesson one', async ({ page }) => {
      await open(page, { dir, mode: 'edit' });
      const panel = page.locator('[data-testid="edit-admin-panel"]');
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(dir === 'rtl' ? /كل حصصه/ : /every lesson they attend/i);
    });
  });
}

test.describe('responsible Admin in the Schedule (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the per-student rows stack and stay inside the dialog', async ({ page }) => {
    const f = await open(page);
    await selectStudents(page, ['Arwa Ahmed', 'Ahmed Mohamed']);

    const arwa = row(page, 'create', f.arwaId);
    await expect(arwa).toBeVisible();

    // Rows stack rather than squeezing side by side at this width.
    const [arwaBox, ahmedBox] = await Promise.all([
      arwa.boundingBox(), row(page, 'create', f.ahmedId).boundingBox(),
    ]);
    expect(ahmedBox!.y).toBeGreaterThan(arwaBox!.y + arwaBox!.height - 1);

    // The dialog never scrolls sideways.
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"]') as HTMLElement | null;
      return el ? el.scrollWidth - el.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // And the Admin dropdown is usable at this width.
    await page.locator(`[data-testid="create-admin-${f.ahmedId}"]`).tap();
    const list = page.locator('[cmdk-list]').first();
    await expect(list).toBeVisible();
    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(376);
    await page.locator('[cmdk-item]').filter({ hasText: /^Asmaa$/ }).first().tap();
    await expect(row(page, 'create', f.ahmedId)).toHaveAttribute('data-admin-id', f.asmaaId);
  });
});
