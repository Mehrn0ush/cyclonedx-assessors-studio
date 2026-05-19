import type { Page } from '@playwright/test';

/**
 * Wait for the Element Plus toast / message system to surface a
 * notification matching `text`. Element Plus mounts messages outside
 * the main app root in a `.el-message` container.
 */
export async function expectMessage(page: Page, text: string | RegExp, opts?: { timeout?: number }): Promise<void> {
  const locator = page.locator('.el-message').filter({ hasText: text });
  await locator.first().waitFor({ state: 'visible', timeout: opts?.timeout ?? 10_000 });
}

/**
 * Wait for any network activity to settle, then a short tick. Use
 * sparingly: prefer explicit awaitable assertions.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
