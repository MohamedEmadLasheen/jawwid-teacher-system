import { test, expect, type Page } from '@playwright/test';

/**
 * Legend filtering on the REAL TeacherWeeklySchedulePage.
 *
 * Two things make this view different from the Master Schedule, and both are
 * asserted here rather than assumed:
 *
 *   * its rows are DAYS, not teachers, so ALL SEVEN stay on screen even when a
 *     filter leaves them with nothing to draw. A week that silently loses
 *     Wednesday reads as a broken calendar, not a filtered one.
 *   * it is pinned to one teacher, so a `teacherIds` value inherited from the
 *     Master Schedule must never be able to swap the week out from under it.
 *
 * The page component itself is rendered — not a reassembly of its parts —
 * because the defect this suite exists for was the page failing to pass
 * `interactive` and failing to read the store. A harness that wired those up
 * itself would stay green through exactly that bug.
 */

const url = (dir: 'ltr' | 'rtl' = 'ltr') => `/tests/schedule-layout/teacher-weekly.html?dir=${dir}`;

type Fixtures = {
  fullTemplateId: string; partTemplateId: string;
  dinaId: string; zainabId: string;
  weeklyTeacherId: string; weeklyTeacherName: string;
  weekDinaDays: number[]; weekZainabDays: number[];
  weekTrialDays: number[]; weekActiveDays: number[]; weekPausedDays: number[];
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(url(dir));
  await page.waitForSelector('[data-testid="ready"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => (window as unknown as { __legendFixtures: Fixtures }).__legendFixtures);
}

/** The day labels in the frozen leading column — one per rendered day row. */
const dayRows = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.sticky.start-0 p'))
      .map((p) => (p.textContent ?? '').trim())
      .filter(Boolean)
  );

/**
 * Indices (0=Sunday) of the day rows that actually draw a lesson card.
 *
 * The row root is the PARENT of the sticky label column, not the nearest
 * `div.flex` — the label column is itself a flex container, so `closest`
 * stops there and finds no lesson layer inside it.
 */
const daysWithLessons = (page: Page) =>
  page.evaluate(() => {
    const out: number[] = [];
    document.querySelectorAll('.sticky.start-0 p').forEach((label, i) => {
      const row = label.closest('.sticky')?.parentElement;
      if (row && row.querySelectorAll('div.z-20').length > 0) out.push(i);
    });
    return out;
  });

const state = (page: Page) => page.locator('[data-testid="filter-state"]');

for (const dir of ['ltr', 'rtl'] as const) {
  test.describe(`teacher weekly legend (${dir})`, () => {
    test('the real page renders, and both legends are interactive', async ({ page }) => {
      const f = await open(page, dir);
      // Only TeacherWeeklySchedulePage renders a teacher picker above a week.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await dayRows(page)).toHaveLength(7);

      for (const sel of [
        `[data-testid="legend-shift-${f.fullTemplateId}"]`,
        `[data-testid="legend-supervisor-${f.dinaId}"]`,
        '[data-testid="legend-status-trial"]',
        '[data-testid="legend-free-time"]',
        '[data-testid="legend-outside-shift"]',
      ]) {
        await expect(page.locator(sel), sel).toHaveJSProperty('tagName', 'BUTTON');
        await expect(page.locator(sel), sel).toHaveAttribute('aria-pressed', 'false');
      }
    });

    test('aria-pressed toggles, and toggling off restores the week', async ({ page }) => {
      const f = await open(page, dir);
      const chip = page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`);
      const before = await daysWithLessons(page);

      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(state(page)).toHaveAttribute('data-supervisor-ids', f.dinaId);

      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => daysWithLessons(page)).toEqual(before);
    });

    // -----------------------------------------------------------------
    // THE defining rule of this view: seven rows, always.
    // -----------------------------------------------------------------
    test('all seven day rows survive every filter, even when emptied', async ({ page }) => {
      const f = await open(page, dir);

      for (const [label, sel] of [
        ['Dina', `[data-testid="legend-supervisor-${f.dinaId}"]`],
        ['Trial', '[data-testid="legend-status-trial"]'],
        ['Outside shift', '[data-testid="legend-outside-shift"]'],
      ] as const) {
        await page.locator(sel).click();
        expect(await dayRows(page), `${label}: seven rows`).toHaveLength(7);
        await page.locator(sel).click();
      }

      // Part-time, on a full-time teacher: the whole week empties and the
      // seven rows still stand.
      await page.locator(`[data-testid="legend-shift-${f.partTemplateId}"]`).click();
      expect(await dayRows(page)).toHaveLength(7);
      await expect.poll(() => daysWithLessons(page)).toEqual([]);
    });

    test('supervisor filters leave exactly their own days drawing lessons', async ({ page }) => {
      const f = await open(page, dir);

      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekDinaDays);
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();

      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekZainabDays);
    });

    test('same category ORs: Dina + Zainab is the union of their days', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      const union = [...new Set([...f.weekDinaDays, ...f.weekZainabDays])].sort((a, b) => a - b);
      await expect.poll(() => daysWithLessons(page)).toEqual(union);
    });

    test('Trial, Active and Paused each pick out their own days', async ({ page }) => {
      const f = await open(page, dir);

      await page.locator('[data-testid="legend-status-trial"]').click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekTrialDays);
      await page.locator('[data-testid="legend-status-trial"]').click();

      await page.locator('[data-testid="legend-status-active"]').click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekActiveDays);
      await page.locator('[data-testid="legend-status-active"]').click();

      // Paused is fetched on demand — the day is empty until it is asked for.
      await expect.poll(() => daysWithLessons(page)).not.toEqual(f.weekPausedDays);
      await page.locator('[data-testid="legend-status-paused"]').click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekPausedDays);
      expect(await dayRows(page)).toHaveLength(7);
    });

    test('AND across categories: Full-time + Zainab + Trial', async ({ page }) => {
      const f = await open(page, dir);
      await page.locator(`[data-testid="legend-shift-${f.fullTemplateId}"]`).click();
      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      await page.locator('[data-testid="legend-status-trial"]').click();
      // Only the Wednesday lesson is all three.
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekTrialDays);
      expect(await dayRows(page)).toHaveLength(7);
    });

    test('Free time and Outside shift are availability filters, not lesson ones', async ({ page }) => {
      await open(page, dir);
      await page.locator('[data-testid="legend-free-time"]').click();
      await expect(state(page)).toHaveAttribute('data-available-only', 'true');
      expect(await dayRows(page)).toHaveLength(7);
      await page.locator('[data-testid="legend-free-time"]').click();

      await page.locator('[data-testid="legend-outside-shift"]').click();
      await expect(state(page)).toHaveAttribute('data-outside-shift-only', 'true');
      expect(await dayRows(page)).toHaveLength(7);
    });

    // -----------------------------------------------------------------
    // Occupancy must not move when a lesson is merely hidden.
    // -----------------------------------------------------------------
    test('hiding a lesson never manufactures free time', async ({ page }) => {
      const f = await open(page, dir);

      const bands = (dayIndex: number) => page.evaluate((i) => {
        const label = Array.from(document.querySelectorAll('.sticky.start-0 p'))[i];
        const row = label?.closest('.sticky')?.parentElement;
        if (!row) return null;
        return Array.from(row.querySelectorAll('div.z-10')).map((b) => {
          const r = b.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.left)];
        });
      }, dayIndex);

      // Sunday holds a Dina lesson; filter to Zainab so it is hidden.
      const sundayBefore = await bands(0);
      expect(sundayBefore).not.toBeNull();

      await page.locator(`[data-testid="legend-supervisor-${f.zainabId}"]`).click();
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekZainabDays);

      // The hidden lesson's minutes must still be occupied — identical bands.
      expect(await bands(0)).toEqual(sundayBefore);
    });

    // -----------------------------------------------------------------
    // Inherited filters, and the way out of them.
    // -----------------------------------------------------------------
    test('a teacherIds filter inherited from the Master Schedule cannot steal the week', async ({ page }) => {
      await open(page, dir);
      const before = await daysWithLessons(page);
      expect(before.length).toBeGreaterThan(0);

      // Arrive as if another teacher had been selected on the Master Schedule.
      // The store genuinely holds it...
      await page.evaluate(() => {
        (window as unknown as { __setFilter: (k: string, v: unknown) => void })
          .__setFilter('teacherIds', ['PT-1']);
      });
      await expect(state(page)).toHaveAttribute('data-teacher-ids', 'PT-1');

      // ...and the week is still the PINNED teacher's, unchanged. If the page
      // spread the store filters after teacherIds instead of before, this week
      // would empty out entirely.
      expect(await dayRows(page)).toHaveLength(7);
      await expect.poll(() => daysWithLessons(page)).toEqual(before);
    });

    test('other inherited filters DO carry through', async ({ page }) => {
      const f = await open(page, dir);
      // A supervisor chosen elsewhere is already narrowing this week on arrival.
      await page.evaluate((dina) => {
        (window as unknown as { __setFilter: (k: string, v: unknown) => void })
          .__setFilter('supervisorIds', [dina]);
      }, f.dinaId);
      await expect.poll(() => daysWithLessons(page)).toEqual(f.weekDinaDays);
      // ...and the page says so, with a way out.
      await expect(page.locator('[data-testid="weekly-active-filters"]')).toBeVisible();
    });

    test('Clear filters appears only when filters are active, and clears them', async ({ page }) => {
      const f = await open(page, dir);
      const banner = page.locator('[data-testid="weekly-active-filters"]');
      const clear = page.locator('[data-testid="weekly-clear-filters"]');

      await expect(banner).toHaveCount(0);

      await page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`).click();
      await expect(banner).toBeVisible();
      await expect(clear).toBeVisible();

      await clear.click();
      await expect(banner).toHaveCount(0);
      await expect(state(page)).toHaveAttribute('data-supervisor-ids', '');
      await expect(page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`))
        .toHaveAttribute('aria-pressed', 'false');
      expect(await dayRows(page)).toHaveLength(7);
    });
  });
}

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('@375px the chips are tappable and the week keeps its seven rows', async ({ page }) => {
    const f = await open(page);
    const chip = page.locator(`[data-testid="legend-supervisor-${f.dinaId}"]`);
    await expect(chip).toHaveJSProperty('tagName', 'BUTTON');
    await chip.tap();
    await expect.poll(() => daysWithLessons(page)).toEqual(f.weekDinaDays);
    expect(await dayRows(page)).toHaveLength(7);
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
});
