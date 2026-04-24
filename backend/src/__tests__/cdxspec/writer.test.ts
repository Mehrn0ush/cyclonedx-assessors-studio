/**
 * Regression tests for the cdxspec writer modules.
 *
 * Specifically guards against three documented export bugs found in
 * the original SSDF attestation export (uploads/attestation-06ed9de1):
 *
 * Bug A: conformance.score / confidence.score were emitted as
 *        DECIMAL strings ("1.00") instead of numbers, failing the
 *        CycloneDX schema's `type: number` constraint.
 * Bug B: Claim objects leaked DB-internal keys (id, bomRef, name,
 *        isCounterClaim, attestationId, createdAt, updatedAt,
 *        targetEntityId), failing the schema's
 *        `additionalProperties: false`.
 * Bug C: Signatories without `signature` and without
 *        `externalReference` violated the schema oneOf. Coverage of
 *        this case is documented but not enforced; the writer
 *        currently passes the signatory through unchanged because
 *        the enforcement strategy is still being decided.
 *
 * The fixtures here mirror the shape of demo-data attestation rows
 * (DECIMAL columns arrive as strings from PGlite, target_entity_id
 * may be null, etc.) so any future regression in the writer will
 * surface here before the user discovers it through a manual
 * export.
 */

import { describe, it, expect } from 'vitest';

import {
  assessorFromUserRow,
  attestationFromRow,
  claimFromRow,
  composeBom,
  composeDeclarations,
  isCounterClaim,
  refFor,
  signatoryBlock,
  standardFromRow,
  TargetResolver,
  validateBom,
  type Bom,
  type ClaimRefMap,
} from '../../cdxspec/index.js';

/** A reduced shape that matches the demo SSDF assessment rows. */
interface FixtureClaimRow {
  id: string;
  attestation_id: string;
  bom_ref: string | null;
  target: string;
  target_entity_id: string | null;
  predicate: string | null;
  reasoning: string | null;
  is_counter_claim: boolean;
  // Extraneous keys that prior code leaked into the BOM. Including
  // them in the fixture so the test proves the writer ignores them.
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface FixtureRequirementRow {
  requirement_id: string;
  conformance_score: unknown;
  conformance_rationale: string | null;
  confidence_score: unknown;
  confidence_rationale: string | null;
}

function buildSsdfFixture(): {
  claims: FixtureClaimRow[];
  requirements: FixtureRequirementRow[];
} {
  const attestationId = 'att-1';
  return {
    claims: [
      {
        id: 'c1',
        attestation_id: attestationId,
        bom_ref: null,
        target: 'Acme Software, Inc.',
        target_entity_id: null,
        predicate: 'implements',
        reasoning: 'Documented control aligns with PO.1.1.',
        is_counter_claim: false,
        name: 'PO.1.1 implementation',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
      {
        id: 'c2',
        attestation_id: attestationId,
        bom_ref: null,
        target: 'Acme Software, Inc.',
        target_entity_id: null,
        predicate: 'implements',
        reasoning: 'Disagreement with primary claim.',
        is_counter_claim: true,
        name: 'PO.1.1 counter',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
    ],
    requirements: [
      // PGlite returns DECIMAL columns as strings — this is the
      // exact shape that triggered Bug A.
      {
        requirement_id: 'r1',
        conformance_score: '1.00',
        conformance_rationale: 'Fully conformant.',
        confidence_score: '0.85',
        confidence_rationale: 'High confidence based on review.',
      },
      {
        requirement_id: 'r2',
        conformance_score: '0.50',
        conformance_rationale: 'Partial.',
        confidence_score: null,
        confidence_rationale: null,
      },
    ],
  };
}

describe('cdxspec writer — SSDF regression', () => {
  it('coerces conformance/confidence scores to numbers (Bug A)', () => {
    const { claims: claimRows, requirements } = buildSsdfFixture();
    const resolver = new TargetResolver();
    const claims = claimRows.map((row) => claimFromRow(row, resolver));

    const allClaims: string[] = [];
    const allCounterClaims: string[] = [];
    claimRows.forEach((row, idx) => {
      const ref = claims[idx]['bom-ref'];
      if (isCounterClaim(row)) allCounterClaims.push(ref);
      else allClaims.push(ref);
    });

    const claimRefs: ClaimRefMap = {
      byRequirementId: new Map(),
      allClaims,
      allCounterClaims,
    };

    const attestation = attestationFromRow({
      row: { id: 'att-1', summary: 'SSDF attestation' },
      requirements,
      claimRefs,
    });

    expect(attestation.map).toHaveLength(2);
    for (const entry of attestation.map) {
      expect(typeof entry.conformance.score).toBe('number');
      expect(entry.conformance.score).toBeGreaterThanOrEqual(0);
      expect(entry.conformance.score).toBeLessThanOrEqual(1);
      if (entry.confidence) {
        expect(typeof entry.confidence.score).toBe('number');
      }
    }

    // Specific values prove the string -> number coercion.
    expect(attestation.map[0].conformance.score).toBe(1);
    expect(attestation.map[0].confidence?.score).toBe(0.85);
    expect(attestation.map[1].conformance.score).toBe(0.5);
    expect(attestation.map[1].confidence).toBeUndefined();
  });

  it('emits Claim objects with only schema-legal keys (Bug B)', () => {
    const { claims: claimRows } = buildSsdfFixture();
    const resolver = new TargetResolver();
    const claims = claimRows.map((row) => claimFromRow(row, resolver));

    const allowed = new Set([
      'bom-ref',
      'target',
      'predicate',
      'mitigationStrategies',
      'reasoning',
      'evidence',
      'counterEvidence',
      'externalReferences',
      'signature',
    ]);

    for (const claim of claims) {
      for (const key of Object.keys(claim)) {
        expect(allowed.has(key)).toBe(true);
      }
      // Forbidden keys that prior code leaked.
      const c = claim as unknown as Record<string, unknown>;
      expect(c.id).toBeUndefined();
      expect(c.bomRef).toBeUndefined();
      expect(c.name).toBeUndefined();
      expect(c.isCounterClaim).toBeUndefined();
      expect(c.attestationId).toBeUndefined();
      expect(c.createdAt).toBeUndefined();
      expect(c.updatedAt).toBeUndefined();
      expect(c.targetEntityId).toBeUndefined();
    }
  });

  it('splits counter-claims into map[].counterClaims', () => {
    const { claims: claimRows, requirements } = buildSsdfFixture();
    const resolver = new TargetResolver();
    const claims = claimRows.map((row) => claimFromRow(row, resolver));

    const allClaims: string[] = [];
    const allCounterClaims: string[] = [];
    claimRows.forEach((row, idx) => {
      const ref = claims[idx]['bom-ref'];
      if (isCounterClaim(row)) allCounterClaims.push(ref);
      else allClaims.push(ref);
    });

    const claimRefs: ClaimRefMap = {
      byRequirementId: new Map(),
      allClaims,
      allCounterClaims,
    };

    const attestation = attestationFromRow({
      row: { id: 'att-1', summary: 'SSDF attestation' },
      requirements,
      claimRefs,
    });

    for (const entry of attestation.map) {
      expect(entry.claims).toEqual(allClaims);
      expect(entry.counterClaims).toEqual(allCounterClaims);
    }
  });

  it('synthesizes one organizationalEntity per distinct target', () => {
    const { claims: claimRows } = buildSsdfFixture();
    const resolver = new TargetResolver();
    claimRows.forEach((row) => claimFromRow(row, resolver));

    // Both fixture claims point at the same target, so dedupe keeps
    // the count at one.
    const orgs = resolver.organizations();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].name).toBe('Acme Software, Inc.');
    expect(orgs[0]['bom-ref']).toBeDefined();
  });

  it('produces a BOM that validates against bom-1.7.schema.json', () => {
    const { claims: claimRows, requirements } = buildSsdfFixture();
    const resolver = new TargetResolver();
    const claims = claimRows.map((row) => claimFromRow(row, resolver));

    const allClaims: string[] = [];
    const allCounterClaims: string[] = [];
    claimRows.forEach((row, idx) => {
      const ref = claims[idx]['bom-ref'];
      if (isCounterClaim(row)) allCounterClaims.push(ref);
      else allClaims.push(ref);
    });

    const claimRefs: ClaimRefMap = {
      byRequirementId: new Map(),
      allClaims,
      allCounterClaims,
    };

    const attestation = attestationFromRow({
      row: { id: 'att-1', summary: 'SSDF attestation' },
      requirements,
      claimRefs,
      assessorRef: refFor('assessor', 'a1'),
    });

    const standard = standardFromRow({
      row: {
        id: 's1',
        identifier: 'SSDF',
        name: 'Secure Software Development Framework',
        version: '1.1',
        description: 'NIST SP 800-218',
        owner: 'NIST',
      },
      requirements: [
        { id: 'r1', identifier: 'PO.1.1', name: 'Identify policies', description: 'Define policies.' },
        { id: 'r2', identifier: 'PO.1.2', name: 'Implement policies', description: null },
      ],
    });

    const declarations = composeDeclarations({
      assessors: [
        assessorFromUserRow({
          user: { id: 'a1', display_name: 'Alice Assessor', email: 'alice@example.com' },
          thirdParty: true,
        }),
      ],
      attestations: [attestation],
      claims,
      targetResolver: resolver,
    });

    const bom: Bom = composeBom({
      specVersion: '1.7',
      declarations,
      definitions: { standards: [standard] },
    });

    const result = validateBom(bom);
    if (!result.valid) {
      // Surface every error to make the failure diagnosable.
      // eslint-disable-next-line no-console
      console.error('Schema validation errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('assessorFromUserRow places person info in organization.contact (Bug D)', () => {
    const a = assessorFromUserRow({
      user: { id: 'a1', display_name: 'Alice Assessor', email: 'alice@example.com' },
      thirdParty: false,
    });

    // The CycloneDX schema's assessor object only permits bom-ref,
    // organization, and thirdParty. Top-level name/email would fail
    // additionalProperties validation.
    const allowed = new Set(['bom-ref', 'organization', 'thirdParty']);
    for (const key of Object.keys(a)) {
      expect(allowed.has(key)).toBe(true);
    }
    const raw = a as unknown as Record<string, unknown>;
    expect(raw.name).toBeUndefined();
    expect(raw.email).toBeUndefined();

    expect(a.organization?.contact?.[0]?.name).toBe('Alice Assessor');
    expect(a.organization?.contact?.[0]?.email).toBe('alice@example.com');
    expect(a.thirdParty).toBe(false);
  });

  it('signatoryBlock passes through the row shape without mutation', () => {
    // The writer itself still produces a best-effort block from the
    // DB row; validation against the CycloneDX Signatory oneOf is a
    // separate concern (see isSignatoryValid and the
    // buildAffirmationForAssessment export helper).
    const sig = signatoryBlock({
      row: { name: 'Carol Signer', role: 'CTO' },
      organization: { name: 'Acme Software, Inc.' },
    });
    expect(sig.name).toBe('Carol Signer');
    expect(sig.role).toBe('CTO');
    expect(sig.organization?.name).toBe('Acme Software, Inc.');
    expect(sig.signature).toBeUndefined();
    expect(sig.externalReference).toBeUndefined();
  });

  it('isSignatoryValid enforces the CycloneDX Signatory oneOf', async () => {
    const { isSignatoryValid } = await import('../../cdxspec/index.js');

    // Name + role + organization only: satisfies neither branch.
    expect(
      isSignatoryValid(
        signatoryBlock({
          row: { name: 'Name Only', role: 'CTO' },
          organization: { name: 'Acme Software, Inc.' },
        }),
      ),
    ).toBe(false);

    // Digital signature branch: `signature` alone passes.
    expect(
      isSignatoryValid(
        signatoryBlock({
          row: { name: 'Digital', role: 'CTO' },
          organization: { name: 'Acme' },
          envelope: {
            algorithm: 'Ed25519',
            publicKey: {
              kty: 'OKP',
              crv: 'Ed25519',
              x: 'placeholder',
            },
            value: 'placeholder',
          },
        }),
      ),
    ).toBe(true);

    // Electronic signature branch: externalReference + organization.
    expect(
      isSignatoryValid(
        signatoryBlock({
          row: {
            name: 'Electronic',
            role: 'CTO',
            external_reference_type: 'signature',
            external_reference_url: 'https://example.com/sig.pdf',
          },
          organization: { name: 'Acme' },
        }),
      ),
    ).toBe(true);

    // externalReference without organization fails oneOf.
    expect(
      isSignatoryValid(
        signatoryBlock({
          row: {
            name: 'Orphan Ref',
            external_reference_type: 'signature',
            external_reference_url: 'https://example.com/sig.pdf',
          },
          organization: null,
        }),
      ),
    ).toBe(false);
  });
});
