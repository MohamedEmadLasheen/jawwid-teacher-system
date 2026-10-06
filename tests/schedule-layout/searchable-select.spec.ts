import { test, expect, type Page } from '@playwright/test';

/**
 * The shared SearchableSelect, rendered.
 *
 * The pure suites prove the match rule (search.test.mjs) and the threshold
 * policy (selectors.test.mjs). This one covers what only exists once the
 * component is on screen: combobox/listbox/option roles, keyboard operation,
 * grouping that survives filtering, and RTL — all against the real Tailwind
 * build, in both directions.
 */

const state = (page: Page) => page.locator('[data-testid="state"]');

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/schedule-layout/searchable-select.html?dir=${dir}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

/** The visible option rows, in order. */
const optionTexts = (page: Page) =>
  page.locator('[role="option"]').allInnerTexts().then((all) => all.map((s) => s.trim()));

/** The group headings currently rendered in the popover. */
const headings = (page: Page) =>
  page.locator('[cmdk-group-heading]').allInnerTexts().then((all) => all.map((s) => s.trim()));

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`SearchableSelect (${dir})`, () => {
    // ---------------------------------------------------------------------
    // Semantics
    // ---------------------------------------------------------------------
    test('the trigger is a combobox and the panel is a listbox of options', async ({ page }) => {
      await open(page, dir);
      const trigger = page.locator('[data-testid="flat"]');

      await expect(trigger).toHaveJSProperty('tagName', 'BUTTON');
      await expect(trigger).toHaveAttribute('role', 'combobox');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
      await expect(trigger).toHaveAttribute('aria-label', 'Flat teacher picker');

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[role="listbox"]')).toHaveCount(1);
      expect((await optionTexts(page)).length).toBe(6);
      // The id the <label htmlFor> points at is on the trigger itself.
      await expect(page.locator('button#flat')).toHaveCount(1);
    });

    test('selecting an option closes the panel and shows the label', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      await page.getByRole('option', { name: 'Mohamed Hussein' }).click();

      await expect(state(page)).toHaveAttribute('data-flat', 'T4');
      await expect(page.locator('[data-testid="flat"]')).toContainText('Mohamed Hussein');
      await expect(page.locator('[role="listbox"]')).toHaveCount(0);
    });

    test('the selected option is marked as selected when reopened', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      await page.getByRole('option', { name: 'Rokaya Ramadan' }).click();
      await page.locator('[data-testid="flat"]').click();

      // The tick is rendered for the chosen row and hidden for the others.
      const ticked = await page.locator('[role="option"]').evaluateAll((rows) =>
        rows
          .filter((row) => {
            const icon = row.querySelector('svg');
            return !!icon && !icon.classList.contains('opacity-0');
          })
          .map((row) => row.textContent?.trim())
      );
      expect(ticked).toEqual(['Rokaya Ramadan']);
    });

    test('a disabled option cannot be chosen', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="disabled-opt"]').click();
      const disabled = page.getByRole('option', { name: 'Not selectable' });
      await expect(disabled).toHaveAttribute('data-disabled', 'true');
      await disabled.click({ force: true });
      await expect(state(page)).toHaveAttribute('data-disabled-value', '');
    });

    // ---------------------------------------------------------------------
    // Search
    // ---------------------------------------------------------------------
    test('search: exact, partial, case-insensitive, id, extra searchText', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      const box = page.getByPlaceholder('Search');

      await box.fill('Mohamed Hussein');
      expect(await optionTexts(page)).toEqual(['Mohamed Hussein']);

      await box.fill('Roka');
      expect(await optionTexts(page)).toEqual(['Rokaya Ramadan']);

      await box.fill('ZAINAB');
      expect(await optionTexts(page)).toEqual(['Zainab Hazem']);

      // searchText only — "T6" appears in no label.
      await box.fill('T6');
      expect(await optionTexts(page)).toEqual(['Zainab Hazem']);

      // A parent name carried in searchText finds the record.
      await box.fill('محمد علي');
      expect(await optionTexts(page)).toEqual(['أحمد حسين']);
    });

    test('search folds Arabic hamza forms', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      const box = page.getByPlaceholder('Search');

      // Typed without hamza; stored with it.
      await box.fill('احمد');
      expect(await optionTexts(page)).toEqual(['أحمد حسين']);
      await box.fill('ايمان');
      expect(await optionTexts(page)).toEqual(['إيمان سعيد']);
      await box.fill('امنة');
      expect(await optionTexts(page)).toEqual(['آمنة مجدي']);

      // And the exact stored spelling still works.
      await box.fill('أحمد');
      expect(await optionTexts(page)).toEqual(['أحمد حسين']);
    });

    test('no results shows the empty state, and clearing restores the list', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      const box = page.getByPlaceholder('Search');

      await box.fill('nobody at all');
      expect(await optionTexts(page)).toEqual([]);
      await expect(page.locator('[cmdk-empty]')).toBeVisible();

      await box.fill('');
      expect((await optionTexts(page)).length).toBe(6);
    });

    test('the query resets between openings', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').click();
      await page.getByPlaceholder('Search').fill('Roka');
      expect((await optionTexts(page)).length).toBe(1);

      await page.keyboard.press('Escape');
      await page.locator('[data-testid="flat"]').click();
      // A stale query would silently hide options the next time around.
      expect((await optionTexts(page)).length).toBe(6);
      await expect(page.getByPlaceholder('Search')).toHaveValue('');
    });

    // ---------------------------------------------------------------------
    // Grouping
    // ---------------------------------------------------------------------
    test('groups render with their headings, and survive filtering', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="grouped"]').click();

      expect(await headings(page)).toEqual(['Full-time — 12:00 PM–7:00 PM', 'Part-time — 2:00 PM–6:00 PM']);
      expect(await optionTexts(page)).toEqual([
        'أحمد حسين', 'Arwa Ahmed', 'Doaa Zakaria', 'Aya Mustafa', 'Zainab Hazem',
      ]);

      // A search that hits both groups keeps both headings.
      await page.getByPlaceholder('Search').fill('a');
      expect((await headings(page)).length).toBe(2);
    });

    test('a group that filters down to nothing disappears entirely', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="grouped"]').click();
      const box = page.getByPlaceholder('Search');

      // Only full-timers match: the Part-time heading must not be left behind.
      await box.fill('Doaa');
      expect(await optionTexts(page)).toEqual(['Doaa Zakaria']);
      expect(await headings(page)).toEqual(['Full-time — 12:00 PM–7:00 PM']);

      // Only a part-timer matches.
      await box.fill('Aya');
      expect(await optionTexts(page)).toEqual(['Aya Mustafa']);
      expect(await headings(page)).toEqual(['Part-time — 2:00 PM–6:00 PM']);

      // Nothing matches: no headings at all.
      await box.fill('zzz');
      expect(await headings(page)).toEqual([]);
    });

    test('selection through a group keeps the right value', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="grouped"]').click();
      await page.getByPlaceholder('Search').fill('Aya');
      await page.getByRole('option', { name: 'Aya Mustafa' }).click();

      await expect(state(page)).toHaveAttribute('data-grouped', 'P1');
      await expect(page.locator('[data-testid="grouped"]')).toContainText('Aya Mustafa');

      // Reopening shows the whole grouped list again, with the tick in place.
      await page.locator('[data-testid="grouped"]').click();
      expect((await headings(page)).length).toBe(2);
    });

    // ---------------------------------------------------------------------
    // Multi-select
    // ---------------------------------------------------------------------
    test('multi-select accumulates, stays open, and toggles off', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="many"]').click();

      await page.getByRole('option', { name: 'Mohamed Hussein' }).click();
      await expect(page.locator('[role="listbox"]')).toHaveCount(1);
      await page.getByRole('option', { name: 'Zainab Hazem' }).click();
      await expect(state(page)).toHaveAttribute('data-many', 'T4,T6');

      await page.getByRole('option', { name: 'Mohamed Hussein' }).click();
      await expect(state(page)).toHaveAttribute('data-many', 'T6');
    });

    // ---------------------------------------------------------------------
    // Keyboard
    // ---------------------------------------------------------------------
    test('keyboard: open, arrow, Enter, Escape', async ({ page }) => {
      await open(page, dir);
      const trigger = page.locator('[data-testid="flat"]');

      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('[role="listbox"]')).toHaveCount(1);

      // The search box takes focus so typing filters immediately.
      await expect(page.getByPlaceholder('Search')).toBeFocused();

      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const highlighted = await page.locator('[role="option"][data-selected="true"]').innerText();
      await page.keyboard.press('Enter');

      await expect(page.locator('[role="listbox"]')).toHaveCount(0);
      await expect(trigger).toContainText(highlighted.trim());

      // Escape closes without choosing.
      await trigger.click();
      await expect(page.locator('[role="listbox"]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="listbox"]')).toHaveCount(0);
      await expect(trigger).toContainText(highlighted.trim());
    });

    test('keyboard: typing then Enter picks the filtered match', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="flat"]').focus();
      await page.keyboard.press('Space');
      await page.keyboard.type('امنة');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(state(page)).toHaveAttribute('data-flat', 'T3');
    });

    test('focus returns to the trigger after closing', async ({ page }) => {
      await open(page, dir);
      const trigger = page.locator('[data-testid="flat"]');
      await trigger.click();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    });

    // ---------------------------------------------------------------------
    // Direction
    // ---------------------------------------------------------------------
    test('the panel follows the document direction and does not clip', async ({ page }) => {
      await open(page, dir);
      const trigger = page.locator('[data-testid="flat"]');
      await trigger.click();

      const geom = await page.evaluate(() => {
        const panel = document.querySelector('[role="listbox"]')!.closest('[data-radix-popper-content-wrapper]')
          ?? document.querySelector('[role="listbox"]')!.parentElement!;
        const icon = document.querySelector('[cmdk-input-wrapper] svg') as HTMLElement;
        const input = document.querySelector('[cmdk-input]') as HTMLElement;
        const r = panel.getBoundingClientRect();
        return {
          direction: getComputedStyle(document.querySelector('[cmdk-root]')!).direction,
          iconX: icon.getBoundingClientRect().left,
          inputX: input.getBoundingClientRect().left,
          left: r.left,
          right: r.right,
          vw: window.innerWidth,
          docScrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });

      expect(geom.direction).toBe(dir);
      // The search icon sits on the inline-start side: left of the input in
      // LTR, right of it in RTL. A physical margin would put it on the same
      // side in both, which is the bug the logical margin prevents.
      if (dir === 'ltr') expect(geom.iconX).toBeLessThan(geom.inputX);
      else expect(geom.iconX).toBeGreaterThan(geom.inputX);

      // Nothing hangs off the viewport, in either direction.
      expect(geom.left).toBeGreaterThanOrEqual(-1);
      expect(geom.right).toBeLessThanOrEqual(geom.vw + 1);
      expect(geom.docScrollW).toBeLessThanOrEqual(geom.clientW + 1);
    });

    test('the plain 4-option Select still works alongside it', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="plain"]').click();
      await page.getByRole('option', { name: '90 minutes' }).click();
      await expect(state(page)).toHaveAttribute('data-plain', '90');
    });
  });
}
