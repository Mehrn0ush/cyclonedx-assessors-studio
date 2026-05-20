import { test, expect } from '../../fixtures/index.js';

/**
 * Accessibility smoke for each top-level authenticated route.
 *
 * Hard fail on any critical violation. No allowlist. Fixes must land
 * in the product before this spec can pass.
 *
 * Injects axe-core 4.10 from cdnjs; the spec self-skips if the CDN
 * is unreachable so an air-gapped runner does not go red here.
 *
 * On failure the test dumps the full violation context (rule id,
 * description, help URL, and the failing HTML snippets with their
 * CSS selectors) so the fixer does not need a trace viewer.
 */

interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string;
}

interface AxeResult {
  violations: Array<{
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    description: string;
    helpUrl?: string;
    nodes: AxeNode[];
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
      if (critical.length === 0) return;

      // Build a detailed failure message: rule id, description, help URL,
      // and per-node selectors + HTML snippet so the fixer can jump
      // straight to the component without a trace viewer.
      const lines: string[] = [];
      for (const v of critical) {
        lines.push(`\n  ${v.id} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`);
        lines.push(`    ${v.description}`);
        if (v.helpUrl) lines.push(`    ${v.helpUrl}`);
        v.nodes.forEach((n, i) => {
          const html = n.html.length > 240 ? `${n.html.slice(0, 240)}…` : n.html;
          lines.push(`    [${i}] selector: ${n.target.join(' >> ')}`);
          lines.push(`        html: ${html}`);
        });
      }
      throw new Error(`Critical a11y violations on ${route}:${lines.join('\n')}`);
    });
  }
});
