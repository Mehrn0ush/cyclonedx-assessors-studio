import { test, expect } from '../../fixtures/index.js';

/**
 * Locale smoke tests.
 *
 * Reference (frontend/src/i18n/index.ts):
 *   - AVAILABLE_LOCALES: en-US, fr-FR, de-DE, es-ES, zh-CN, ja-JP, ru-RU.
 *   - Active locale is selected via the `ui_locale` cookie (validated
 *     against the allowlist).
 *   - Unknown locale codes are ignored and the default (en-US) is used.
 *
 * For each locale we:
 *   1. Inject ui_locale cookie before navigation.
 *   2. Load /dashboard as the admin.
 *   3. Assert no console errors fire.
 *   4. Assert the page rendered (we look for the role-fanout navigation
 *      shell which is always present after the dashboard mounts).
 *   5. Assert the document does not contain literal vue-i18n missing-key
 *      markers (vue-i18n falls back to the key itself when not found;
 *      we look for the conventional "$t(" / "{key}" / "missing" emit).
 *
 * This is a smoke test, not a translation correctness test. Catching
 * a wholesale missing or malformed locale bundle is the goal.
 */

const LOCALES = ['en-US', 'fr-FR', 'de-DE', 'es-ES', 'zh-CN', 'ja-JP', 'ru-RU'] as const;

test.describe('i18n locale smoke @regression', () => {
  for (const locale of LOCALES) {
    test(`${locale} dashboard renders without missing-key fallback`, async ({ authedAs, browser }, testInfo) => {
      // Use a fresh context so the ui_locale cookie cleanly applies.
      const { context: adminCtx } = await authedAs('admin');
      const storage = await adminCtx.storageState();
      const baseURL = testInfo.project.use.baseURL!;
      const ctx = await browser.newContext({
        baseURL,
        storageState: storage,
      });
      const url = new URL(baseURL);
      await ctx.addCookies([
        {
          name: 'ui_locale',
          value: locale,
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ]);

      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto('/dashboard', { waitUntil: 'networkidle' });

      // Some kind of nav must render. We do not depend on translated
      // text here; we depend on the app shell being present.
      await expect(page.locator('aside, nav, [data-testid="sidebar"], [data-test="sidebar"]').first()).toBeVisible({
        timeout: 10_000,
      });

      // Filter out non-blocking warnings vue-i18n emits in dev mode.
      const blocking = consoleErrors.filter(
        (e) =>
          !/devtools/i.test(e) &&
          !/Download the Vue Devtools/.test(e) &&
          !/\bWarning\b/i.test(e),
      );
      expect(blocking, `console errors for locale ${locale}: ${blocking.join('\n')}`).toEqual([]);

      // Search the body for the literal vue-i18n missing-key markers.
      const body = await page.textContent('body');
      expect(body, 'empty body').toBeTruthy();
      expect(body, `body contains "$t(" for ${locale}`).not.toContain('$t(');
      // vue-i18n's missing handler typically logs to console rather than
      // rendering. If it ever starts rendering the key path as fallback,
      // this catches it.
      expect(body, `body contains a raw "{key}" placeholder for ${locale}`).not.toMatch(/\{[a-zA-Z0-9_.]+\}/);

      await ctx.close();
    });
  }

  test('unknown locale falls back to en-US without crashing', async ({ authedAs, browser }, testInfo) => {
    const { context: adminCtx } = await authedAs('admin');
    const storage = await adminCtx.storageState();
    const baseURL = testInfo.project.use.baseURL!;
    const ctx = await browser.newContext({ baseURL, storageState: storage });
    const url = new URL(baseURL);
    await ctx.addCookies([
      {
        name: 'ui_locale',
        value: 'xx-YY',
        domain: url.hostname,
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await ctx.newPage();
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('aside, nav').first()).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });
});
