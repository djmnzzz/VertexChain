import { test, expect } from '@playwright/test';

test.describe('Map page — browse, gist, post', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3099' });
    await page.goto('/map');
  });

  test('happy path: browse landing, navigate to map, view gists, and post a new gist', async ({ page }) => {
    await expect(page.getByText('Map is loading...')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Map is loading...')).not.toBeVisible({ timeout: 15_000 });

    const addButton = page.getByRole('button', { name: 'Add new gist' });
    await expect(addButton).toBeAttached({ timeout: 15_000 });
    await addButton.click({ force: true, timeout: 5_000 });

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    await expect(page.getByText('Pin a New Gist')).toBeVisible();
    const textarea = page.getByLabel('Gist content');
    await expect(textarea).toBeVisible();

    const gistText = 'E2E test gist — great suya spot at this location!';
    await textarea.fill(gistText);
    await expect(textarea).toHaveValue(gistText);

    await page.getByRole('button', { name: /pin gist/i }).click();

    await expect(page.getByRole('button', { name: /pinning\.\.\./i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: /pinning\.\.\./i })).not.toBeVisible({ timeout: 5_000 });

    await expect(modal).not.toBeVisible();
  });

  test('negative: cannot submit with empty gist content', async ({ page }) => {
    await expect(page.getByText('Map is loading...')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Map is loading...')).not.toBeVisible({ timeout: 15_000 });

    const addButton = page.getByRole('button', { name: 'Add new gist' });
    await expect(addButton).toBeAttached({ timeout: 15_000 });
    await addButton.click({ force: true, timeout: 5_000 });

    await expect(page.getByRole('dialog')).toBeVisible();

    const textarea = page.getByLabel('Gist content');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');

    await page.getByRole('button', { name: /pin gist/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /pin gist/i })).toBeVisible();
  });

  test('negative: escape key closes the modal without posting', async ({ page }) => {
    await expect(page.getByText('Map is loading...')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Map is loading...')).not.toBeVisible({ timeout: 15_000 });

    const addButton = page.getByRole('button', { name: 'Add new gist' });
    await expect(addButton).toBeAttached({ timeout: 15_000 });
    await addButton.click({ force: true, timeout: 5_000 });

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await page.getByLabel('Gist content').fill('This should not appear');
    await page.keyboard.press('Escape');

    await expect(modal).not.toBeVisible();
  });

  test('negative: clicking the backdrop overlay closes the modal without posting', async ({ page }) => {
    await expect(page.getByText('Map is loading...')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Map is loading...')).not.toBeVisible({ timeout: 15_000 });

    const addButton = page.getByRole('button', { name: 'Add new gist' });
    await expect(addButton).toBeAttached({ timeout: 15_000 });
    await addButton.click({ force: true, timeout: 5_000 });

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await page.getByLabel('Gist content').fill('This should also not appear');

    await page.mouse.click(100, 100);

    await expect(modal).not.toBeVisible();
  });
});
