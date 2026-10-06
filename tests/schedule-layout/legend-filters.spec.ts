import { test, expect, type Page } from '@playwright/test';

/**
 * The schedule legend as a real filter surface.
 *
 * The pure suite (scripts/schedule-geometry-tests/filters.test.mjs) proves
 * the semantics. What it cannot prove is everything that only exists once
 * the components are rendered:
 *
 *   * the legend items are actual focusable buttons with aria-pressed, not
 *     styled spans;
 *   * clicking one really changes the rows the grid draws;
 *   * the legend and the filter bar move together, because they share one
 *     store field rather than holding two copies;
 *   * toggling a chip does not reflow the legend;
 *   * all of it holds under dir="rtl" and on a phone viewport.
 *
 * Fixtures only — the harness seeds React Query and stubs @/lib/supabase.
 */

type Fixtures = {
  fullTemplateId: string;
  partTemplateId: string;
  dinaId: string;
  zainabId: string;
  fullTimeTeachers: string[];
  partTimeTeachers: string[];
  dinaTeachers: string[];
  zainabTeachers: string[];
  trialTeachers: string[];
  pausedTeachers: string[];
};

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/tests/schedule-layout/legend-filters.html?dir=${dir}`);
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await expect(page.locator('[data-testid="filter-state"]')).toHaveAttribute('data-available-only', 'false');
  // Web fonts settle AFTER first paint and every label gets a few px wider.
  // The no-layout-shift test measures text boxes to a tenth of a pixel, so it
  // must not race the swap — otherwise it reports a shift on chips nobody
  // clicked, which is a false alarm, not the regression it is looking for.
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => (window as unknown as { __legendFixtures: Fixtures }).__legendFixtures);
}

/**
 * The teacher names the grid is currently drawing, read from the frozen
 * label column. Virtualization means this is the rendered window, which is
 * exactly what a user can see; the fixture roster is small enough to fit.
 */
async function visibleTeachers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.sticky.start-0 p'));
    return labels.map((p) => (p.textContent ?? '').trim()).filter(Boolean);
  });
}

/** Lesson cards currently rendered, by their accessible text. */
async function visibleLessonCount(page: Page): Promise<number> {
  return page.locator('div.absolute.top-0.h-full.z-20').count();
}

const state = (page: Page) => page.locator('[data-testid="filter-state"]');

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`legend filters (${dir})`, () => {
    test('every legend item is a button with aria-pressed, not a span', async ({ page }) => {
      const f = await open(page, dir);
      const ids = [
        `legend-shift-${f.fullTemplateId}`, `legend-shift-${f.partTemplateId}`,
        `legend-supervisor-${f.dinaId}`, `legend-supervisor-${f.zainabId}`,
        'legend-free-time', 'legend-outside-shift',
        'legend-status-trial', 'legend-status-active', 'legend-status-paused',
      ];
      for (const id of ids) {
        const chip = page.locator(`[data-testid="${id}"]`);
        await expect(chip, id).toHaveCount(1);
        await expect(chip, id).toHaveJSProperty('tagName', 'BUTTON');
        await expect(chip, id).toHaveAttribute('aria-pressed', 'false');
      }
    });

    test('the shift chips keep deriving name, window and count from the roster', async ({ page }) => {
      const f = await open(page, dir);
      const full = page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`);
      const part = page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`);
      await expect(full).toContainText('Full-time');
      await expect(full).toContainText('12:00 PM');
      await expect(full).toContainText('7:00 PM');
      await expect(full).toContainText(String(f.fullTimeTeachers.length));
      await expect(part).toContainText('Part-time');
      await expect(part).toContainText('2:00 PM');
      await expect(part).toContainText('6:00 PM');
      await expect(part).toContainText(String(f.partTimeTeachers.length));
    });

    test('Full-time filters the grid, and clicking again clears it', async ({ page }) => {
      const f = await open(page, dir);
      const all = await visibleTeachers(page);
      expect(all).toEqual([...f.fullTimeTeachers, ...f.partTimeTeachers]);

      const full = page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`);
      await full.click();
      await expect(full).toHaveAttribute('aria-pressed', 'true');
      await expect(state(page)).toHaveAttribute('data-shift-template-ids', f.fullTemplateId);
      expect(await visibleTeachers(page)).toEqual(f.fullTimeTeachers);

      await full.click();
      await expect(full).toHaveAttribute('aria-pressed', 'false');
      expect(await visibleTeachers(page)).toEqual(all);
    });

    test('Part-time alone, then Full-time + Part-time ORs within the category', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`).click();
      expect(await visibleTeachers(page)).toEqual(f.partTimeTeachers);

      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      expect(await visibleTeachers(page)).toEqual([...f.fullTimeTeachers, ...f.partTimeTeachers]);
      await expect(state(page)).toHaveAttribute(
        'data-shift-template-ids', `${f.partTemplateId},${f.fullTemplateId}`
      );
    });

    // ---------------------------------------------------------------------
    // The schedule must actually narrow — not merely leave rows empty.
    // ---------------------------------------------------------------------
    test('each supervisor narrows the rows to that supervisor\'s real data', async ({ page }) => {
      const f = await open(page, dir);

      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      expect((await visibleTeachers(page)).sort()).toEqual([...f.dinaTeachers].sort());

      // Swap to the other supervisor: a different, non-overlapping row set.
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      expect((await visibleTeachers(page)).sort()).toEqual([...f.zainabTeachers].sort());

      // Toggling off restores the full roster.
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      expect(await visibleTeachers(page)).toEqual([...f.fullTimeTeachers, ...f.partTimeTeachers]);
    });

    test('supervisors OR within the category, at row level', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      const union = [...new Set([...f.dinaTeachers, ...f.zainabTeachers])].sort();
      expect((await visibleTeachers(page)).sort()).toEqual(union);
    });

    test('Trial, Active and Paused each narrow the rows', async ({ page }) => {
      const f = await open(page, dir);

      await page.locator('[data-testid="legend-status-trial"]').click();
      expect((await visibleTeachers(page)).sort()).toEqual([...f.trialTeachers].sort());
      await page.locator('[data-testid="legend-status-trial"]').click();

      await page.locator('[data-testid="legend-status-active"]').click();
      const active = await visibleTeachers(page);
      expect(active.length).toBeGreaterThan(0);
      // The paused-only teacher must NOT appear under Active.
      for (const name of f.pausedTeachers) expect(active).not.toContain(name);
      await page.locator('[data-testid="legend-status-active"]').click();

      // Paused is fetched on demand — the row exists only once it is asked for.
      expect(await visibleTeachers(page)).not.toEqual(f.pausedTeachers);
      await page.locator('[data-testid="legend-status-paused"]').click();
      await expect(state(page)).toHaveAttribute('data-lifecycle-statuses', 'paused');
      await expect
        .poll(async () => (await visibleTeachers(page)).sort())
        .toEqual([...f.pausedTeachers].sort());
    });

    test('Active + Paused shows both, and toggling back restores', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator('[data-testid="legend-status-active"]').click();
      await page.locator('[data-testid="legend-status-paused"]').click();
      await expect.poll(async () => {
        const names = await visibleTeachers(page);
        return f.pausedTeachers.every((n) => names.includes(n)) && names.length > f.pausedTeachers.length;
      }).toBe(true);

      await page.locator('[data-testid="legend-status-paused"]').click();
      await page.locator('[data-testid="legend-status-active"]').click();
      expect(await visibleTeachers(page)).toEqual([...f.fullTimeTeachers, ...f.partTimeTeachers]);
    });

    test('hiding a lesson never repaints its minutes as free', async ({ page }) => {
      const f = await open(page, dir);

      const bandsFor = async (teacher: string) => page.evaluate((name) => {
        const row = Array.from(document.querySelectorAll('.sticky.start-0 p'))
          .find((p) => (p.textContent ?? '').trim() === name)?.closest('.sticky')?.parentElement;
        if (!row) return null;
        return Array.from(row.querySelectorAll('div.z-10')).map((b) => {
          const r = b.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.left)];
        });
      }, teacher);

      const subject = f.dinaTeachers.find((n) => f.zainabTeachers.includes(n))!;
      const before = await bandsFor(subject);

      // Hide some of that teacher's lessons with a supervisor filter.
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      expect(await visibleTeachers(page)).toContain(subject);
      // The free-capacity bands must be byte-identical: occupancy comes from
      // the unfiltered set, so a hidden lesson still holds its minutes.
      expect(await bandsFor(subject)).toEqual(before);
    });

    test('a supervisor chip writes the EXISTING supervisor filter, and several OR', async ({ page }) => {
      const f = await open(page, dir);
      const before = await visibleLessonCount(page);

      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await expect(state(page)).toHaveAttribute('data-supervisor-ids', f.dinaId);
      const dinaOnly = await visibleLessonCount(page);
      expect(dinaOnly).toBeGreaterThan(0);
      expect(dinaOnly).toBeLessThan(before);

      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      await expect(state(page)).toHaveAttribute('data-supervisor-ids', `${f.dinaId},${f.zainabId}`);
      await expect(page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await visibleLessonCount(page)).toBeGreaterThan(dinaOnly);

      // Deselecting one leaves the other selected.
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await expect(state(page)).toHaveAttribute('data-supervisor-ids', f.zainabId);
    });

    test('Trial writes the existing lifecycle filter', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="legend-status-trial"]').click();
      await expect(state(page)).toHaveAttribute('data-lifecycle-statuses', 'trial');
      // One trial lesson in the fixtures.
      expect(await visibleLessonCount(page)).toBe(1);

      await page.locator('[data-testid="legend-status-active"]').click();
      await expect(state(page)).toHaveAttribute('data-lifecycle-statuses', 'trial,active');
      expect(await visibleLessonCount(page)).toBeGreaterThan(1);
    });

    test('Free time keeps only teachers with real unsold capacity, and does NOT empty the rows', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="legend-free-time"]').click();
      await expect(state(page)).toHaveAttribute('data-available-only', 'true');

      const names = await visibleTeachers(page);
      // Doaa Zakaria is booked 12:00-19:00 solid: no free capacity.
      expect(names).not.toContain('Doaa Zakaria');
      // Hend Mohammed is on shift with no lessons: all free.
      expect(names).toContain('Hend Mohammed');
      // Arwa Ahmed has gaps around two lessons — and those lessons must still
      // be drawn. This is the regression: the old implementation emptied the
      // lesson list, which also painted the whole shift as free.
      expect(names).toContain('Arwa Ahmed');
      expect(await visibleLessonCount(page)).toBeGreaterThan(0);

      // Free bands must not cover the booked minutes.
      const overlap = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sticky.start-0 p'))
          .map((p) => p.closest('.sticky')!.parentElement!)
          .filter((row) => (row.querySelector('.sticky.start-0 p')?.textContent ?? '').trim() === 'Arwa Ahmed');
        const row = rows[0];
        const box = (el: Element) => el.getBoundingClientRect();
        const bands = Array.from(row.querySelectorAll('div.z-10')).map(box);
        const cards = Array.from(row.querySelectorAll('div.z-20')).map(box);
        return cards.some((c) => bands.some((b) => Math.min(b.right, c.right) - Math.max(b.left, c.left) > 1));
      });
      expect(overlap, 'a free-capacity band overlaps a lesson card').toBe(false);
    });

    test('Outside shift keeps only teachers booked outside their own window', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="legend-outside-shift"]').click();
      await expect(state(page)).toHaveAttribute('data-outside-shift-only', 'true');

      const names = await visibleTeachers(page);
      expect(names.sort()).toEqual(['Aya Mustafa', 'Zainab Hazem']);
      // Aya's 14:00 lesson is inside her shift, so only the 19:00 one shows.
      expect(await visibleLessonCount(page)).toBe(2);
    });

    test('categories AND together: Full-time + Dina + Trial', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await page.locator('[data-testid="legend-status-trial"]').click();

      // AND across three categories. The only trial lesson belongs to
      // Zainab's student, so no lesson is both Dina's and a trial — and with
      // nothing left to draw, no row is an answer either.
      expect(await visibleTeachers(page)).toEqual([]);
      expect(await visibleLessonCount(page)).toBe(0);

      // Swap Dina for Zainab and exactly the qualifying row and lesson appear.
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      expect(await visibleTeachers(page)).toEqual(f.trialTeachers);
      expect(await visibleLessonCount(page)).toBe(1);
    });

    test('a zero-result combination says so and offers a way back', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      await page.locator('[data-testid="legend-outside-shift"]').click();

      expect(await visibleTeachers(page)).toEqual([]);
      const clear = page.getByRole('button', { name: dir === 'rtl' ? 'مسح الفلاتر' : 'Clear filters' });
      await expect(clear).toBeVisible();
      await clear.click();
      expect(await visibleTeachers(page)).toEqual([...f.fullTimeTeachers, ...f.partTimeTeachers]);
      await expect(state(page)).toHaveAttribute('data-shift-template-ids', '');
      await expect(state(page)).toHaveAttribute('data-outside-shift-only', 'false');
    });

    test('the legend and the filter bar are one source of truth, in both directions', async ({ page }) => {
      await open(page, dir);
      const trialChip = page.locator('[data-testid="legend-status-trial"]');
      const freeChip = page.locator('[data-testid="legend-free-time"]');
      const trialLabel = dir === 'rtl' ? 'تجريبي' : 'Trial';

      // Controls are addressed by their visible label, never by index: the bar
      // mixes MultiSelectFilter triggers with Radix Selects, and all of them
      // report role="combobox".
      const availableSwitch = page
        .locator('label', { hasText: dir === 'rtl' ? 'الفترات المتاحة فقط' : 'Available slots only' })
        .locator('button[role="switch"]');
      const outsideSwitch = page
        .locator('label', { hasText: dir === 'rtl' ? 'خارج الشيفت فقط' : 'Outside shift only' })
        .locator('button[role="switch"]');
      const statusTrigger = page.locator('button[role="combobox"]', {
        hasText: dir === 'rtl' ? 'كل الحالات' : 'All Statuses',
      });

      // Bar → legend, for both of the new row-level filters.
      await availableSwitch.click();
      await expect(freeChip).toHaveAttribute('aria-pressed', 'true');
      await availableSwitch.click();
      await expect(freeChip).toHaveAttribute('aria-pressed', 'false');

      await outsideSwitch.click();
      await expect(page.locator('[data-testid="legend-outside-shift"]')).toHaveAttribute('aria-pressed', 'true');
      await outsideSwitch.click();
      await expect(page.locator('[data-testid="legend-outside-shift"]')).toHaveAttribute('aria-pressed', 'false');

      // Legend → bar. Picking Trial in the legend must show up in the status
      // multi-select's own summary — the placeholder is replaced by the label.
      await expect(statusTrigger).toHaveCount(1);
      await trialChip.click();
      await expect(page.locator('button[role="combobox"]', { hasText: trialLabel })).toHaveCount(1);
      await expect(statusTrigger).toHaveCount(0);

      // …and un-picking it there clears the chip.
      await page.locator('button[role="combobox"]', { hasText: trialLabel }).click();
      await page.getByRole('option', { name: trialLabel }).click();
      await page.keyboard.press('Escape');
      await expect(trialChip).toHaveAttribute('aria-pressed', 'false');
      await expect(state(page)).toHaveAttribute('data-lifecycle-statuses', '');
    });

    test('search combines with a legend filter', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`).click();
      await page.locator('input[placeholder]').first().fill('aya');
      expect(await visibleTeachers(page)).toEqual(['Aya Mustafa']);

      // The same search under Full-time matches nobody — AND, not OR.
      await page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`).click();
      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      expect(await visibleTeachers(page)).toEqual([]);
    });

    test('chips are keyboard operable and show a focus ring', async ({ page }) => {
      const f = await open(page, dir);
      const full = page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`);
      await full.focus();
      await expect(full).toBeFocused();

      const ring = await full.evaluate((el) => {
        const s = getComputedStyle(el);
        // The app's focus ring is a box-shadow (Tailwind `ring-2`).
        return { shadow: s.boxShadow, outlineStyle: s.outlineStyle };
      });
      expect(ring.shadow === 'none' && ring.outlineStyle === 'none').toBe(false);

      await page.keyboard.press('Space');
      await expect(full).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Enter');
      await expect(full).toHaveAttribute('aria-pressed', 'false');
    });

    test('toggling a chip causes no layout shift', async ({ page }) => {
      const f = await open(page, dir);
      const measure = () => page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[data-testid^="legend-"]'));
        return ids.map((el) => {
          const r = el.getBoundingClientRect();
          return [el.getAttribute('data-testid'), +r.width.toFixed(1), +r.height.toFixed(1), +r.top.toFixed(1)];
        });
      });

      const before = await measure();
      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      await page.locator('[data-testid="legend-free-time"]').click();
      await page.locator('[data-testid="legend-status-trial"]').click();
      expect(await measure()).toEqual(before);
    });
  });
}

test.describe('legend filters (mobile, 375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the chips wrap, stay tappable and still filter', async ({ page }) => {
    const f = await open(page);

    const geometry = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll('[data-testid^="legend-"]'));
      return {
        tooShort: chips.filter((el) => el.getBoundingClientRect().height < 24).map((el) => el.getAttribute('data-testid')),
        overflowing: chips.filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .map((el) => el.getAttribute('data-testid')),
        bodyScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    expect(geometry.tooShort).toEqual([]);
    expect(geometry.overflowing).toEqual([]);
    expect(geometry.bodyScrollsSideways).toBe(false);

    await page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`).tap();
    expect(await visibleTeachers(page)).toEqual(f.partTimeTeachers);
  });
});
