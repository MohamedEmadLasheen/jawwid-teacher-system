import { test, expect, type Page } from '@playwright/test';

/**
 * STUDENT → RESPONSIBLE ADMIN → COLOUR, in the real components.
 *
 * The pure suite (scripts/schedule-geometry-tests/studentadmin.test.mjs)
 * proves the rules. What it cannot prove is everything that only exists once
 * the components are rendered and clicked:
 *
 *   * "Responsible Admin" is a real combobox, listing the four Admins with
 *     their canonical colour dots and no raw ids;
 *   * it refuses to submit without an Admin, and says so accessibly;
 *   * creating a student writes the Admin and the schedule immediately draws
 *     that Admin's colour;
 *   * editing from Dina to Asmaa repaints the grid red → green with no colour
 *     ever being stored;
 *   * a reload keeps it, because the colour is derived every time;
 *   * a legacy unassigned student is tolerated, shown honestly, and can be
 *     fixed through the same form;
 *   * all of it under RTL and on a phone viewport.
 *
 * Fixtures only — the harness seeds React Query and stubs @/lib/supabase.
 */

type Fixtures = {
  dinaId: string;
  zainabId: string;
  rehabId: string;
  asmaaId: string;
  colors: Record<string, string>;
  adminNames: string[];
  lessonCardTestId: string;
  ahmedId: string;
  legacyId: string;
};

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/schedule-layout/student-admin.html?dir=${dir}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => (window as unknown as { __adminFixtures: Fixtures }).__adminFixtures);
}

const reload = (page: Page) =>
  page.evaluate(() => (window as unknown as { __adminFixtures: { reload: () => void } }).__adminFixtures.reload());

const selector = (page: Page) => page.locator('[data-testid="student-supervisor"]');
const dbRows = async (page: Page) =>
  JSON.parse((await page.locator('[data-testid="db-state"]').getAttribute('data-rows')) ?? '[]') as
    { id: string; full_name: string; supervisor_id: string | null }[];

/** Opens the Admin combobox and returns its option rows. */
async function openAdminList(page: Page) {
  await selector(page).click();
  const list = page.locator('[role="listbox"], [cmdk-list]').first();
  await expect(list).toBeVisible();
  return list.locator('[cmdk-item]');
}

async function pickAdmin(page: Page, name: string) {
  const options = await openAdminList(page);
  await options.filter({ hasText: new RegExp(`^${name}$`) }).first().click();
  await expect(page.locator('[role="listbox"], [cmdk-list]').first()).toBeHidden();
}

const lessonColor = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]`).getAttribute('data-supervisor-color');

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`student responsible Admin (${dir})`, () => {
    test('the create form offers the four Admins, each with its canonical colour', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator('[data-testid="open-create"]').click();

      const options = await openAdminList(page);
      const texts = (await options.allInnerTexts()).map((s) => s.trim());
      expect(texts).toEqual(f.adminNames);

      // The dot next to each name is that Admin's own colour, read from the
      // data the component rendered rather than from a screenshot.
      for (const [id, color] of Object.entries(f.colors)) {
        const name = f.adminNames[['dinaId', 'zainabId', 'rehabId', 'asmaaId']
          .findIndex((k) => (f as unknown as Record<string, string>)[k] === id)];
        const dot = options.filter({ hasText: new RegExp(`^${name}$`) }).first()
          .locator('[data-testid="supervisor-color-dot"]');
        await expect(dot, name).toHaveAttribute('data-color', color);
      }

      // No raw uuid is ever shown.
      expect(texts.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    });

    test('a deactivated Admin is not offered for a new student', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="open-create"]').click();
      const options = await openAdminList(page);
      await expect(options.filter({ hasText: 'Former Admin' })).toHaveCount(0);
    });

    test('the Admin is searchable and keyboard reachable', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="open-create"]').click();

      // ArrowDown opens it, as a native select would.
      await selector(page).focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[role="listbox"], [cmdk-list]').first()).toBeVisible();

      await page.keyboard.type('Asm');
      const options = page.locator('[cmdk-item]');
      await expect(options).toHaveCount(1);
      await expect(options.first()).toContainText('Asmaa');

      await page.keyboard.press('Enter');
      await expect(selector(page)).toContainText('Asmaa');
    });

    test('submitting without an Admin is refused, with an accessible error', async ({ page }) => {
      await open(page, dir);
      const before = await dbRows(page);

      await page.locator('[data-testid="open-create"]').click();
      await page.locator('#student-full-name').fill('Nour Khaled');
      await page.getByRole('button', { name: /save|حفظ/i }).click();

      const error = page.locator('[data-testid="student-supervisor-error"]');
      await expect(error).toBeVisible();
      await expect(error).toHaveAttribute('role', 'alert');
      await expect(selector(page)).toHaveAttribute('aria-invalid', 'true');
      await expect(selector(page)).toHaveAttribute('aria-describedby', 'student-supervisor-error');

      // Nothing was written, and the dialog is still open.
      expect(await dbRows(page)).toEqual(before);
      await expect(page.locator('#student-full-name')).toBeVisible();

      // Choosing an Admin clears the error immediately, not on the next submit.
      await pickAdmin(page, 'Dina');
      await expect(error).toHaveCount(0);
      await expect(selector(page)).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('creating a student with Dina persists the relationship and nothing else', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator('[data-testid="open-create"]').click();
      await page.locator('#student-full-name').fill('Nour Khaled');
      await pickAdmin(page, 'Dina');
      await page.getByRole('button', { name: /save|حفظ/i }).click();

      const rows = await dbRows(page);
      const created = rows.find((r) => r.full_name === 'Nour Khaled');
      expect(created?.supervisor_id).toBe(f.dinaId);

      // The student row holds an id and no colour. Ever.
      const columns = JSON.parse(
        (await page.locator('[data-testid="db-state"]').getAttribute('data-columns')) ?? '[]'
      ) as string[];
      expect(columns.filter((c) => /colou?r/i.test(c))).toEqual([]);

      // And the list shows the ownership with Dina's colour.
      const owner = page.locator(`[data-testid="row-admin-${created!.id}"]`);
      await expect(owner).toHaveText('Dina');
      await expect(owner).toHaveAttribute('data-admin-color', f.colors[f.dinaId]);
    });

    test('the created Admin survives a reload', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator('[data-testid="open-create"]').click();
      await page.locator('#student-full-name').fill('Nour Khaled');
      await pickAdmin(page, 'Rehab');
      await page.getByRole('button', { name: /save|حفظ/i }).click();

      const id = (await dbRows(page)).find((r) => r.full_name === 'Nour Khaled')!.id;
      await reload(page);
      await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });

      const owner = page.locator(`[data-testid="row-admin-${id}"]`);
      await expect(owner).toHaveText('Rehab');
      await expect(owner).toHaveAttribute('data-admin-id', f.rehabId);
      await expect(owner).toHaveAttribute('data-admin-color', f.colors[f.rehabId]);
    });

    test('the edit form opens on the student\'s current Admin', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="edit-${f.ahmedId}"]`).click();
      await expect(selector(page)).toContainText('Dina');
      await expect(
        selector(page).locator('[data-testid="supervisor-color-dot"]')
      ).toHaveAttribute('data-color', f.colors[f.dinaId]);
    });

    test('Dina → Asmaa repaints the schedule red → green, and a reload keeps it', async ({ page }) => {
      const f = await open(page, dir);

      // The lesson starts red, because its only student is Dina's.
      expect(await lessonColor(page, f.lessonCardTestId)).toBe(f.colors[f.dinaId]);

      await page.locator(`[data-testid="edit-${f.ahmedId}"]`).click();
      await pickAdmin(page, 'Asmaa');
      await page.getByRole('button', { name: /save|حفظ/i }).click();

      // The database relationship changed — one column, to Asmaa's id.
      const ahmed = (await dbRows(page)).find((r) => r.id === f.ahmedId);
      expect(ahmed?.supervisor_id).toBe(f.asmaaId);

      // …and the grid is green, with no second write and nothing to invalidate.
      await expect
        .poll(() => lessonColor(page, f.lessonCardTestId))
        .toBe(f.colors[f.asmaaId]);

      // The student row, too.
      await expect(page.locator(`[data-testid="row-admin-${f.ahmedId}"]`)).toHaveText('Asmaa');

      // A reload rebuilds everything from the stored row: still green, because
      // the colour was never stored anywhere to go stale.
      await reload(page);
      await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
      await expect
        .poll(() => lessonColor(page, f.lessonCardTestId))
        .toBe(f.colors[f.asmaaId]);
    });

    test('a legacy unassigned student is shown honestly and fixed through the same form', async ({ page }) => {
      const f = await open(page, dir);

      const owner = page.locator(`[data-testid="row-admin-${f.legacyId}"]`);
      await expect(owner).toHaveText('Unassigned');
      await expect(owner).toHaveAttribute('data-admin-id', '');

      await page.locator(`[data-testid="edit-${f.legacyId}"]`).click();
      // The form does not pretend an Admin is selected…
      await expect(selector(page)).not.toContainText('Dina');
      // …and will not save until one is.
      await page.getByRole('button', { name: /save|حفظ/i }).click();
      await expect(page.locator('[data-testid="student-supervisor-error"]')).toBeVisible();
      expect((await dbRows(page)).find((r) => r.id === f.legacyId)?.supervisor_id).toBeNull();

      await pickAdmin(page, 'Zainab');
      await page.getByRole('button', { name: /save|حفظ/i }).click();
      expect((await dbRows(page)).find((r) => r.id === f.legacyId)?.supervisor_id).toBe(f.zainabId);
      await expect(owner).toHaveText('Zainab');
    });

    test('the legend still draws the four Admins in their own colours', async ({ page }) => {
      const f = await open(page, dir);
      for (const [key, name] of [['dinaId', 'Dina'], ['zainabId', 'Zainab'], ['rehabId', 'Rehab'], ['asmaaId', 'Asmaa']] as const) {
        const id = (f as unknown as Record<string, string>)[key];
        const chip = page.locator(`[data-testid="legend-supervisor-${id}"]`);
        await expect(chip, name).toHaveText(name);
        await expect(chip.locator('[data-testid="supervisor-color-dot"]'), name)
          .toHaveAttribute('data-color', f.colors[id]);
      }
    });
  });
}

test.describe('student responsible Admin (mobile)', () => {
  // hasTouch so a tap is a real touch event, as it is on the device.
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the Admin dropdown opens, fits the screen and is tappable', async ({ page }) => {
    const f = await open(page);
    await page.locator('[data-testid="open-create"]').click();

    const trigger = selector(page);
    // A real touch target, not a 20px sliver.
    const triggerBox = (await trigger.boundingBox())!;
    expect(triggerBox.height).toBeGreaterThanOrEqual(36);

    await trigger.click();
    const list = page.locator('[role="listbox"], [cmdk-list]').first();
    await expect(list).toBeVisible();

    // The popover stays inside the viewport — the classic failure here is a
    // dropdown that renders but cannot be reached.
    const box = (await list.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(667 + 1);

    // All four are reachable, and tapping one selects it.
    await expect(page.locator('[cmdk-item]')).toHaveCount(4);
    await page.locator('[cmdk-item]').filter({ hasText: /^Asmaa$/ }).first().tap();
    await expect(trigger).toContainText('Asmaa');

    // The dialog itself never scrolls sideways.
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"]') as HTMLElement | null;
      return el ? el.scrollWidth - el.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    expect(f.adminNames).toHaveLength(4);
  });
});
