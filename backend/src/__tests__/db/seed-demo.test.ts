/**
 * End-to-end guard that seedDemoData() loads cleanly against a fresh
 * database. A foreign-key violation inside demo-data.json (e.g. a
 * claim_evidence row pointing at a claim or evidence that no longer
 * exists) blows up at dev-start with a PGlite FK error. This test
 * exercises the full seed path so CI catches that shape of bug
 * before it reaches a running installation.
 *
 * The seed helpers are imported dynamically inside the test to pick
 * up the mocked/test database wiring that `setupHttpTests` puts in
 * place.
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { setupHttpTests, loginAs } from '../helpers/http.js';

describe('seedDemoData loads demo-data.json without FK violations', () => {
  setupHttpTests();

  it('seeds every demo row, resolves all FK references, and is idempotent', async () => {
    // Ensure an admin user exists so seedDemoData's ADMIN_USER
    // resolver returns a real id rather than a fresh uuid() that
    // fails the audit_log.user_id FK.
    await loginAs('admin');

    const { getDatabase } = await import('../../db/connection.js');
    const db = getDatabase();

    // Import the SSDF standard first so seedSSDF can resolve
    // SSDF requirement identifiers. The setup-wizard path imports
    // from the standards feed at first boot; here we import the
    // same local JSON directly.
    const { importStandard } = await import('../../services/standard-import.js');
    const fs = await import('node:fs');
    const feedPath = process.env.SSDF_FEED_PATH
      ?? '/sessions/optimistic-epic-goldberg/mnt/uploads/nist_secure-software-development-framework_1.1.cdx.json';
    if (fs.existsSync(feedPath)) {
      const raw = fs.readFileSync(feedPath, 'utf8');
      const feed = JSON.parse(raw);
      const std = feed.definitions?.standards?.[0];
      if (std) {
        await importStandard(std, { markAsImported: true });
      }
    }

    // Seed the demo fixture end to end.
    const { seedDemoData } = await import('../../db/seed-demo.js');
    let seeded: boolean;
    try {
      seeded = await seedDemoData();
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      throw new Error(`seedDemoData threw: ${message}`);
    }
    expect(seeded).toBe(true);

    // Idempotency: a second call on the same database is a no-op and
    // returns false (guarded by the "entities already exist" check
    // at the top of seedDemoData).
    const again = await seedDemoData();
    expect(again).toBe(false);

    // Sanity checks: at least some core rows should have landed.
    const { count: assessmentCount } = (await db
      .selectFrom('assessment')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()) as { count: number | string };
    expect(Number(assessmentCount)).toBeGreaterThan(0);

    const { count: claimCount } = (await db
      .selectFrom('claim')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()) as { count: number | string };
    expect(Number(claimCount)).toBeGreaterThan(0);

    const { count: claimEvidenceCount } = (await db
      .selectFrom('claim_evidence')
      .select(db.fn.count<number>('claim_id').as('count'))
      .executeTakeFirstOrThrow()) as { count: number | string };
    expect(Number(claimEvidenceCount)).toBeGreaterThan(0);

    // Silence unused-import lint on uuidv4 (kept in scope for
    // future fixtures that may need to tack on extra rows before
    // re-seeding).
    void uuidv4;
  });
});
