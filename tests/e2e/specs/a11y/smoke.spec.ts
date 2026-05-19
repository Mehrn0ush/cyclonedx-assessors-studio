import { test, expect } from '../../fixtures/index.js';

/**
 * Accessibility smoke for each top-level authenticated route.
 *
 * Injects axe-core 4.10 via CDN script tag and runs the audit inside
 * the page. We deliberately avoid the @axe-core/playwright wrapper so
 * the e2e package keeps its dependency surface minimal (no extra
 * lockfile churn, no extra CI install step).
 *
 * Why fail only on critical:
 *   - The frontend uses Element Plus, which carries known minor a11y
 *     drift. Failing on every "minor" would freeze the suite or force
 *     a long allowlist.
 *   - Critical violations are the ones that meaningfully break screen
 *     reader / keyboard users. They are the right gate for now.
 *   - A future tightening to "serious" can land once Element Plus
 *     wrappers add the missing semantics.
 *
 * If the CDN is unreachable the test self-skips so a network-isolated
 * CI runner never goes red on this spec without us choosing to.
 */

interface AxeResult {
  violations: Array<{
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    description: string;
    nodes: Array<{ target: string[] }>;
  }>;
}

const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';

const ROUTES = [
  '/dashboard',
  '/entities',
  '/projects',
  '/assessments',
  '/standards',
  '/evidence',
  '/attestations',
  '/admin/user-management',
  '/admin/tags',
  '/admin/webhooks',
  '/admin/audit',
  '/admin/integrations',
  '/admin/chat-integrations',
  '/admin/notification-rules',
  '/admin/encryption',
  '/admin/platform-keys',
  '/settings',
];

test.describe('Accessibility smoke (axe) @regression', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical a11y violations`, async ({ authedAs }) => {
      const { page } = await authedAs('admin');
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator('aside, nav, main').first()).toBeVisible({ timeout: 10_000 });

      try {
        await page.addScriptTag({ url: AXE_CDN });
      } catch (err) {
        test.skip(true, `axe CDN unreachable: ${(err as Error).message}`);
        return;
      }

      const results = (await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const axe = (window as any).axe;
        if (!axe) throw new Error('axe failed to load');
        return await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
      })) as AxeResult;

      const critical = results.violations.filter((v) => v.impact === 'critical');
      if (critical.length > 0) {
        const summary = critical
          .map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`)
          .join('\n');
        throw new Error(`Critical a11y violations on ${route}:\n${summary}`);
      }
    });
  }
});
