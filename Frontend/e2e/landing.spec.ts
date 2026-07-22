import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders the header with navigation', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /vertexchain/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /map/i })).toBeVisible();

    await page.getByRole('link', { name: /map/i }).click();
    await expect(page).toHaveURL(/\/map/);
  });

  test('renders the features section', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Core Features')).toBeVisible();
    await expect(page.getByText('Truly Anonymous')).toBeVisible();
    await expect(page.getByText('Hyperlocal Focus')).toBeVisible();
    await expect(page.getByText('Real-Time & Unfiltered')).toBeVisible();
  });

  test('renders the footer', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});
