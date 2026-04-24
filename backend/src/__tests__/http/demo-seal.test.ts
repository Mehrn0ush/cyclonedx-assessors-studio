import { describe, it, expect } from 'vitest';
import { setupHttpTests } from '../helpers/http.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Narrow sanity check: a sealed affirmation whose signatory carries
 * an `external_reference_*` pair serializes into a CycloneDX 1.7
 * signatory that satisfies the Signatory `oneOf` (externalReference
 * + organization branch), and the resulting BOM validates against
 * the 1.7 schema.
 *
 * Keeping this as a database-shape test (not full HTTP seal flow)
 * avoids coupling to the end-to-end signing ceremony, which is
 * covered by the /seal route tests in affirmations.test.ts.
 */
describe('buildAffirmationForAssessment produces schema-valid signatories', () => {
  setupHttpTests();

  it('export helper emits a signatory that satisfies the oneOf', async () => {
    const { getDatabase } = await import('../../db/connection.js');
    const { buildAffirmationForAssessment } = await import(
      '../../utils/export-affirmation.js'
    );
    const { isSignatoryValid } = await import('../../cdxspec/index.js');
    const { validateBom } = await import('../../cdxspec/validator/index.js');
    const db = getDatabase();

    // Minimal fixture: project → assessment (complete) → affirmation
    // (sealed) → signatory (with externalReference + organization) →
    // slot (pointing at the signatory).
    const projectId = uuidv4();
    await db
      .insertInto('project')
      .values({
        id: projectId,
        name: `Seal fixture project ${Date.now()}`,
        state: 'in_progress',
        workflow_type: 'evidence_driven',
      })
      .execute();

    const standardId = uuidv4();
    await db
      .insertInto('standard')
      .values({
        id: standardId,
        identifier: `STD-SEAL-${Date.now()}`,
        name: 'Seal fixture standard',
        state: 'published',
        is_imported: false,
      })
      .execute();

    const assessmentId = uuidv4();
    await db
      .insertInto('assessment')
      .values({
        id: assessmentId,
        title: 'Seal fixture assessment',
        state: 'complete',
        project_id: projectId,
        standard_id: standardId,
      })
      .execute();

    const orgId = uuidv4();
    await db
      .insertInto('organization')
      .values({
        id: orgId,
        name: 'Acme Corp',
      })
      .execute();

    const sigId = uuidv4();
    await db
      .insertInto('signatory')
      .values({
        id: sigId,
        name: 'Alice Chen',
        role: 'CISO',
        organization_id: orgId,
        external_reference_type: 'electronic-signature',
        external_reference_url: 'https://example.com/sig/alice',
      })
      .execute();

    const affirmationId = uuidv4();
    await db
      .insertInto('affirmation')
      .values({
        id: affirmationId,
        statement: 'Sealed fixture affirmation',
        project_id: projectId,
        assessment_id: assessmentId,
        sealed_at: new Date(),
        // Minimal JSF-shaped envelope blobs: the schema validator
        // only requires the presence of the declarations signature
        // block under declarations.signature. Real envelopes are
        // produced by the /seal route; this shape is enough to
        // populate declarations.signature for the schema test.
        declarations_signature_json: JSON.stringify({
          algorithm: 'RS256',
          value: 'AAA',
          publicKey: { kty: 'RSA', n: 'AA', e: 'AQAB' },
        }),
        document_signature_json: JSON.stringify({
          algorithm: 'RS256',
          value: 'BBB',
          publicKey: { kty: 'RSA', n: 'AA', e: 'AQAB' },
        }),
      })
      .execute();

    const slotId = uuidv4();
    await db
      .insertInto('affirmation_signatory')
      .values({
        id: slotId,
        affirmation_id: affirmationId,
        signatory_id: sigId,
        required_title: 'CISO',
        signed_at: new Date(),
        // signature_json populated so buildAffirmationForAssessment
        // emits the signatory slot even though in this test the
        // exported block relies on the externalReference branch.
        signature_json: JSON.stringify({
          algorithm: 'RS256',
          value: 'CCC',
          publicKey: { kty: 'RSA', n: 'AA', e: 'AQAB' },
        }),
        canonical_hash:
          '0000000000000000000000000000000000000000000000000000000000000000',
        created_at: new Date(),
        updated_at: new Date(),
      } as unknown as Record<string, unknown>)
      .execute();

    const result = await buildAffirmationForAssessment(db, assessmentId);
    expect(result.affirmation).toBeDefined();
    expect(result.affirmation?.signatories?.length ?? 0).toBeGreaterThan(0);
    for (const s of result.affirmation?.signatories ?? []) {
      expect(isSignatoryValid(s)).toBe(true);
    }

    // Attach a per-attestation signature (CycloneDX 1.7 allows each
    // declarations.attestations[i] to carry its own JSF envelope).
    // The sealer in seed-demo-seal.ts produces real envelopes at
    // seed time; here we plant a minimally valid shape to exercise
    // the schema validation path through all three signature layers.
    const attestationSignature = {
      algorithm: 'RS256',
      value: 'DDD',
      publicKey: { kty: 'RSA', n: 'AA', e: 'AQAB' },
    };

    const bom: Record<string, unknown> = {
      $schema: 'http://cyclonedx.org/schema/bom-1.7.schema.json',
      bomFormat: 'CycloneDX',
      specVersion: '1.7',
      serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
      version: 1,
      declarations: {
        attestations: [
          { summary: 'Test', map: [], signature: attestationSignature },
        ],
        claims: [],
        affirmation: result.affirmation,
        signature: result.declarationsSeal,
      },
      signature: result.documentSeal,
    };

    const check = validateBom(bom, '1.7');
    if (!check.valid) {
      console.error('Invalid BOM:', JSON.stringify(bom).slice(0, 2000));
      console.error('Errors:', JSON.stringify(check.errors).slice(0, 4000));
    }
    expect(check.valid).toBe(true);

    // All three signature layers are present and non-empty:
    // affirmation signatory, per-attestation, and root document.
    const declarations = bom.declarations as Record<string, unknown>;
    const attestations = declarations.attestations as Array<Record<string, unknown>>;
    expect(attestations[0].signature).toBeDefined();
    expect(declarations.signature).toBeDefined();
    expect(bom.signature).toBeDefined();
    const affirmation = declarations.affirmation as Record<string, unknown>;
    const signatories = affirmation.signatories as Array<Record<string, unknown>>;
    expect(signatories.length).toBeGreaterThan(0);
  });
});
