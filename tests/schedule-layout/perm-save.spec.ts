import { test, expect, type Page } from '@playwright/test';

const URL = '/tests/schedule-layout/perm-save.html';

type Gate = { calls: Array<{ id: string; perms: string[] }> };
const calls = (p: Page) => p.evaluate(() => (window as unknown as { __permSave: Gate }).__permSave.calls.length);
const settle = (p: Page, how: 'resolve' | 'reject') =>
  p.evaluate((h) => {
    const g = (window as unknown as { __permSave: { resolve?: () => void; reject?: (e: Error) => void } }).__permSave;
    h === 'resolve' ? g.resolve!() : g.reject!(new Error('new row violates row-level security policy'));
  }, how);

async function openDialog(page: Page) {
  // Mobile card layout: its action buttons carry visible text labels, unlike
  // the desktop table's icon-only buttons. Same dialog, same handler.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await page.getByRole('button', { name: /permissions/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('dialog stays open while saving, shows a saving state, and blocks double submit', async ({ page }) => {
  await openDialog(page);
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: /^save$/i });

  await save.click();
  const saving = dialog.getByRole('button', { name: /saving/i });
  await expect(saving).toBeVisible();          // clear loading state
  await expect(saving).toBeDisabled();         // prevents duplicate submission
  await expect(dialog).toBeVisible();          // dialog stays open while saving
  await expect(dialog.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
  await expect(dialog.getByRole('checkbox').first()).toBeDisabled();
  expect(await calls(page)).toBe(1);

  // Escape must not dismiss an in-flight save
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(await calls(page)).toBe(1);
});

test('failure keeps the dialog open, shows the error, and allows retry', async ({ page }) => {
  await openDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^save$/i }).click();
  await settle(page, 'reject');

  await expect(dialog).toBeVisible();                                  // stays open to retry
  const alert = dialog.getByRole('alert');
  await expect(alert).toBeVisible();                                   // clear error message
  await expect(alert).toContainText('Permissions were not saved');
  await expect(alert).toContainText('row-level security');             // surfaces the real cause
  const retry = dialog.getByRole('button', { name: /retry/i });
  await expect(retry).toBeEnabled();

  await retry.click();
  expect(await calls(page)).toBe(2);                                   // retry re-issues the write
  await settle(page, 'resolve');
  await expect(dialog).not.toBeVisible();                              // closes on confirmed success
});

test('success closes the dialog only after the write resolves', async ({ page }) => {
  await openDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^save$/i }).click();
  await expect(dialog).toBeVisible();          // not closed yet
  await settle(page, 'resolve');
  await expect(dialog).not.toBeVisible();
  expect(await calls(page)).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);   // no error shown on success
});
