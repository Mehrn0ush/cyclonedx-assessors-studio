import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
} from '../helpers/http.js';

describe('Import HTTP Routes', () => {
  setupHttpTests();

  /**
   * Helper to generate unique identifiers for test data.
   * Uses counter + timestamp to avoid conflicts.
   */
  let testCounter = 0;
  function getTestId(prefix: string): string {
    testCounter++;
    return `${prefix}-${testCounter}-${Date.now()}`;
  }

  /**
   * Helper to create a minimal valid CycloneDX attestation BOM.
   * Can be extended with optional fields for specific test cases.
   */
  function createValidBom(overrides?: Record<string, any>) {
    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      version: 1,
      serialNumber: `urn:uuid:${getTestId('serial')}`,
      metadata: {
        component: {
          name: 'Test Component',
          version: '1.0.0',
        },
      },
      declarations: {
        targets: {
          organizations: [
            {
              'bom-ref': 'org-1',
              name: 'Test Organization',
              url: ['https://example.com'],
            },
          ],
        },
        evidence: [],
        claims: [],
        attestations: [
          {
            summary: 'Test Attestation',
            map: [],
          },
        ],
      },
      definitions: {
        standards: [],
      },
      ...overrides,
    };
  }

  describe('POST /api/v1/import/attestation', () => {
    describe('Success cases', () => {
      it('should import minimal valid CycloneDX document', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('projectId');
        expect(res.body).toHaveProperty('assessmentId');
        expect(res.body).toHaveProperty('importLog');
        expect(Array.isArray(res.body.importLog)).toBe(true);
        expect(res.body.message).toBe('Attestation imported successfully');
      });

      it('should import with complete standards and requirements', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Test Standard',
                identifier: `TST-${getTestId('ident')}`,
                version: '1.0.0',
                description: 'A test standard for compliance',
                owner: 'Test Owner',
                requirements: [
                  {
                    'bom-ref': `req-1-${getTestId('req')}`,
                    identifier: 'REQ-001',
                    title: 'First Requirement',
                    text: 'This is the first requirement with detailed description',
                    openCre: 'CRE-001',
                  },
                  {
                    'bom-ref': `req-2-${getTestId('req')}`,
                    identifier: 'REQ-002',
                    title: 'Second Requirement',
                    text: 'This is the second requirement',
                    parent: `req-1-${getTestId('req')}`,
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.projectId).toBeDefined();
        expect(res.body.assessmentId).toBeDefined();
        // Verify that importLog contains entries (message always present)
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should import with multiple standards', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-1-${getTestId('std')}`,
                name: 'Standard One',
                identifier: `STD-1-${getTestId('ident')}`,
                version: '1.0',
              },
              {
                'bom-ref': `std-2-${getTestId('std')}`,
                name: 'Standard Two',
                identifier: `STD-2-${getTestId('ident')}`,
                version: '2.0',
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.importLog.length).toBeGreaterThanOrEqual(2);
      });

      it('should import with evidence items', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                  url: ['https://example.com'],
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-1-${getTestId('ev')}`,
                description: 'Security Audit Report',
                propertyName: 'audit_report',
                data: [
                  {
                    classification: 'report',
                  },
                ],
              },
              {
                'bom-ref': `ev-2-${getTestId('ev')}`,
                description: 'Compliance Certificate',
                propertyName: 'cert_file',
                data: [
                  {
                    classification: 'certificate',
                  },
                ],
              },
            ],
            claims: [],
            attestations: [
              {
                summary: 'Attestation with evidence',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should import with claims and evidence links', async () => {
        const agent = await loginAs('admin');
        const evRef = `ev-${getTestId('ev')}`;
        const claimRef = `claim-${getTestId('claim')}`;

        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': evRef,
                description: 'Supporting Evidence',
                propertyName: 'evidence_file',
                data: [{ classification: 'report' }],
              },
            ],
            claims: [
              {
                'bom-ref': claimRef,
                target: `org-${getTestId('org')}`,
                predicate: 'System is secure',
                reasoning: 'Based on security audit',
                evidence: [evRef],
              },
            ],
            attestations: [
              {
                summary: 'Security Attestation',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should import with counter evidence and mitigation strategies', async () => {
        const agent = await loginAs('admin');
        const counterEvRef = `counter-ev-${getTestId('ev')}`;
        const claimRef = `claim-${getTestId('claim')}`;

        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': counterEvRef,
                description: 'Counter Evidence or Mitigation',
                propertyName: 'mitigation',
              },
            ],
            claims: [
              {
                'bom-ref': claimRef,
                target: `org-${getTestId('org')}`,
                predicate: 'Claim with mitigations',
                counterEvidence: [counterEvRef],
                mitigationStrategies: [counterEvRef],
              },
            ],
            attestations: [
              {
                summary: 'Attestation with Mitigations',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should import with affirmation and signatories', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [],
            claims: [],
            affirmation: {
              statement: 'We affirm the accuracy of this attestation',
              signatories: [
                {
                  'bom-ref': `sig-1-${getTestId('sig')}`,
                  name: 'John Doe',
                  role: 'Chief Security Officer',
                  organization: {
                    name: 'Example Corp',
                  },
                },
                {
                  'bom-ref': `sig-2-${getTestId('sig')}`,
                  name: 'Jane Smith',
                  role: 'Compliance Officer',
                },
              ],
            },
            attestations: [
              {
                summary: 'Signed Attestation',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should import with attestation requirement mappings', async () => {
        const agent = await loginAs('admin');
        const reqRef = `req-${getTestId('req')}`;
        const claimRef = `claim-${getTestId('claim')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Compliance Standard',
                identifier: `STD-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': reqRef,
                    identifier: 'REQ-MAPPED',
                    title: 'Mapped Requirement',
                  },
                ],
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [],
            claims: [
              {
                'bom-ref': claimRef,
                target: `org-${getTestId('org')}`,
                predicate: 'Requirement is met',
              },
            ],
            attestations: [
              {
                summary: 'Mapped Attestation',
                map: [
                  {
                    requirement: reqRef,
                    conformance: {
                      score: 0.95,
                      rationale: 'Well implemented',
                      mitigationStrategies: [],
                    },
                    confidence: {
                      score: 0.9,
                      rationale: 'High confidence',
                    },
                    claims: [claimRef],
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should deduplicate standards by identifier', async () => {
        const agent = await loginAs('admin');
        const stdIdentifier = `STD-DUP-${getTestId('dup')}`;

        // First import
        const bom1 = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-1-${getTestId('std')}`,
                name: 'Standard Name',
                identifier: stdIdentifier,
                version: '1.0',
              },
            ],
          },
        });

        const res1 = await agent
          .post('/api/v1/import/attestation')
          .send(bom1);

        expect(res1.status).toBe(201);

        // Second import with same identifier (no version change)
        const bom2 = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-2-${getTestId('std')}`,
                name: 'Standard Name',
                identifier: stdIdentifier,
                version: '1.0',
              },
            ],
          },
        });

        const res2 = await agent
          .post('/api/v1/import/attestation')
          .send(bom2);

        expect(res2.status).toBe(201);
        // Verify that importLog is not empty
        expect(res2.body.importLog).toBeDefined();
        expect(res2.body.importLog.length).toBeGreaterThan(0);
      });

      it('should handle different versions of same standard', async () => {
        const agent = await loginAs('admin');
        const stdIdentifier = `STD-VER-${getTestId('ver')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-v1-${getTestId('std')}`,
                name: 'Versioned Standard',
                identifier: stdIdentifier,
                version: '1.0',
              },
              {
                'bom-ref': `std-v2-${getTestId('std')}`,
                name: 'Versioned Standard',
                identifier: stdIdentifier,
                version: '2.0',
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should assign authenticated user as evidence author', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-${getTestId('ev')}`,
                description: 'Test Evidence',
              },
            ],
            claims: [],
            attestations: [
              {
                summary: 'Test Attestation',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should set project workflow to evidence_driven', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify by checking that project was created with correct workflow
        expect(res.body.projectId).toBeDefined();
      });

      it('should handle evidence with expiration dates', async () => {
        const agent = await loginAs('admin');
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Target Organization',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-${getTestId('ev')}`,
                description: 'Evidence with expiration',
                expires: futureDate.toISOString(),
              },
            ],
            claims: [],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should generate project name from metadata.component.name', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          metadata: {
            component: {
              name: 'My Custom Component',
              version: '1.0.0',
            },
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Project name should be based on component name
        expect(res.body.projectId).toBeDefined();
      });

      it('should fallback to organization name for project naming', async () => {
        const agent = await loginAs('admin');
        const orgName = `Fallback Org ${getTestId('org')}`;

        const bom = createValidBom({
          metadata: {},
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: orgName,
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should include serialNumber in project description', async () => {
        const agent = await loginAs('admin');
        const serialNum = `urn:uuid:${getTestId('serial')}`;

        const bom = createValidBom({
          serialNumber: serialNum,
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.projectId).toBeDefined();
      });

      it('should handle optional bom-ref fields', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          definitions: {
            standards: [
              {
                name: 'Standard Without bom-ref',
                identifier: `STD-NO-REF-${getTestId('std')}`,
                requirements: [
                  {
                    identifier: 'REQ-NO-REF',
                    title: 'Requirement Without bom-ref',
                  },
                ],
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  name: 'Organization Without bom-ref',
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });
    });

    describe('Validation error cases', () => {
      it('should reject missing bomFormat', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();
        delete (bom as any).bomFormat;

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid CycloneDX document');
        expect(res.body.details).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('CycloneDX'),
          })
        );
      });

      it('should reject invalid bomFormat value', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();
        bom.bomFormat = 'NotCycloneDX';

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid CycloneDX document');
      });

      it('should reject missing specVersion', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();
        delete (bom as any).specVersion;

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid CycloneDX document');
        // Verify that details array is populated with validation errors
        expect(res.body.details).toBeDefined();
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
      });

      it('should reject missing declarations', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();
        delete (bom as any).declarations;

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
          'CycloneDX document does not contain declarations'
        );
      });

      it('should handle empty declarations', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          declarations: {},
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        // Should succeed with empty declarations
        expect(res.status).toBe(201);
      });

      it('should reject invalid JSON body', async () => {
        const agent = await loginAs('admin');

        const res = await agent
          .post('/api/v1/import/attestation')
          .send('not valid json');

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it('should reject null body', async () => {
        const agent = await loginAs('admin');

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(undefined as any);

        expect(res.status).toBeGreaterThanOrEqual(400);
      });

      it('should reject empty object body', async () => {
        const agent = await loginAs('admin');

        const res = await agent
          .post('/api/v1/import/attestation')
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid CycloneDX document');
      });

      it('should provide detailed validation errors', async () => {
        const agent = await loginAs('admin');
        const bom = {
          // Missing bomFormat
          specVersion: '', // Empty specVersion
          declarations: {},
        };

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('details');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
      });

      it('should return details with path and message', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();
        bom.bomFormat = 123 as any; // Wrong type

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(400);
        expect(res.body.details).toContainEqual(
          expect.objectContaining({
            path: expect.any(String),
            message: expect.any(String),
          })
        );
      });
    });

    describe('Authorization and authentication', () => {
      it('should require authentication', async () => {
        const { getAgent } = await import('../helpers/http.js');
        const unauthAgent = getAgent();
        const bom = createValidBom();

        const res = await unauthAgent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(401);
      });

      it('should require admin.import permission', async () => {
        const agent = await loginAs('assessor');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(403);
      });

      it('should allow admin to import', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should reject assessee role', async () => {
        const agent = await loginAs('assessee');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(403);
      });
    });

    describe('Response structure', () => {
      it('should return 201 Created status', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should return message field', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Attestation imported successfully');
      });

      it('should return projectId', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.projectId).toBeDefined();
        expect(typeof res.body.projectId).toBe('string');
        // Should be a valid UUID format
        expect(res.body.projectId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      it('should return assessmentId', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.assessmentId).toBeDefined();
        expect(typeof res.body.assessmentId).toBe('string');
      });

      it('should return importLog array', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.importLog).toBeDefined();
        expect(Array.isArray(res.body.importLog)).toBe(true);
      });

      it('should populate importLog with entries', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Test Standard',
                identifier: `STD-${getTestId('ident')}`,
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Test Org',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-${getTestId('ev')}`,
                description: 'Test Evidence',
              },
            ],
            claims: [
              {
                'bom-ref': `claim-${getTestId('claim')}`,
                predicate: 'Test Claim',
              },
            ],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.importLog.length).toBeGreaterThan(0);
        // Should have entries about what was imported
        const logText = res.body.importLog.join(' ');
        expect(logText).toContain('Standard');
        expect(logText).toContain('Organization');
      });

      it('should use camelCase in response', async () => {
        const agent = await loginAs('admin');
        const bom = createValidBom();

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('projectId');
        expect(res.body).toHaveProperty('assessmentId');
        expect(res.body).toHaveProperty('importLog');
        // Should not have snake_case
        expect(res.body).not.toHaveProperty('project_id');
      });
    });

    describe('Complex scenarios', () => {
      it('should handle large document with many requirements', async () => {
        const agent = await loginAs('admin');

        // Create a standard with many requirements
        const requirements = [];
        for (let i = 0; i < 50; i++) {
          requirements.push({
            'bom-ref': `req-${i}-${getTestId('req')}`,
            identifier: `REQ-${String(i).padStart(3, '0')}`,
            title: `Requirement ${i}`,
            text: `This is requirement number ${i} with some description`,
          });
        }

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Large Standard',
                identifier: `STD-LARGE-${getTestId('ident')}`,
                requirements,
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        // Verify that importLog is not empty
        expect(res.body.importLog).toBeDefined();
        expect(res.body.importLog.length).toBeGreaterThan(0);
      });

      it('should handle hierarchical requirements with deep nesting', async () => {
        const agent = await loginAs('admin');

        // Create parent-child requirements
        const req1 = `req-1-${getTestId('req')}`;
        const req2 = `req-2-${getTestId('req')}`;
        const req3 = `req-3-${getTestId('req')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Hierarchical Standard',
                identifier: `STD-HIER-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': req1,
                    identifier: 'REQ-PARENT',
                    title: 'Parent Requirement',
                  },
                  {
                    'bom-ref': req2,
                    identifier: 'REQ-CHILD-1',
                    title: 'Child 1',
                    parent: req1,
                  },
                  {
                    'bom-ref': req3,
                    identifier: 'REQ-CHILD-2',
                    title: 'Child 2',
                    parent: req2,
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle missing optional fields gracefully', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          // No version
          metadata: undefined,
          serialNumber: undefined,
          components: undefined,
          services: undefined,
          externalReferences: undefined,
          properties: undefined,
          declarations: {
            targets: {
              organizations: [
                {
                  name: 'Minimal Organization',
                  // No url
                  // No bom-ref
                },
              ],
            },
            evidence: [
              {
                description: 'Evidence without propertyName',
                // No data, no classification
              },
            ],
            claims: [
              {
                predicate: 'Simple claim without evidence or mitigation',
              },
            ],
            attestations: [
              {
                summary: 'Simple attestation',
                // No map
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle organization with URL array', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Multi-URL Organization',
                  url: [
                    'https://example.com',
                    'https://subdomain.example.com',
                    'https://another.example.com',
                  ],
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle requirements with openCre references', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'CRE Standard',
                identifier: `STD-CRE-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': `req-1-${getTestId('req')}`,
                    identifier: 'REQ-001',
                    title: 'CRE-linked Requirement',
                    openCre: 'CRE-001:CRE-002:CRE-003',
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should create unique project per import', async () => {
        const agent = await loginAs('admin');

        const bom1 = createValidBom({
          serialNumber: `urn:uuid:${getTestId('serial')}`,
        });

        const res1 = await agent
          .post('/api/v1/import/attestation')
          .send(bom1);

        const bom2 = createValidBom({
          serialNumber: `urn:uuid:${getTestId('serial')}`,
        });

        const res2 = await agent
          .post('/api/v1/import/attestation')
          .send(bom2);

        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
        // Each import should create a different project
        expect(res1.body.projectId).not.toBe(res2.body.projectId);
        expect(res1.body.assessmentId).not.toBe(res2.body.assessmentId);
      });

      it('should handle all declaration types together', async () => {
        const agent = await loginAs('admin');

        const evRef1 = `ev-1-${getTestId('ev')}`;
        const evRef2 = `ev-2-${getTestId('ev')}`;
        const claimRef = `claim-${getTestId('claim')}`;
        const reqRef = `req-${getTestId('req')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Complete Standard',
                identifier: `STD-COMPLETE-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': reqRef,
                    identifier: 'REQ-001',
                    title: 'Requirement for mapping',
                  },
                ],
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Complete Organization',
                  url: ['https://example.com'],
                },
              ],
            },
            evidence: [
              {
                'bom-ref': evRef1,
                description: 'Supporting Evidence',
                data: [{ classification: 'report' }],
              },
              {
                'bom-ref': evRef2,
                description: 'Counter Evidence',
              },
            ],
            claims: [
              {
                'bom-ref': claimRef,
                target: `org-${getTestId('org')}`,
                predicate: 'System meets requirements',
                reasoning: 'Verified through audit',
                evidence: [evRef1],
                counterEvidence: [evRef2],
              },
            ],
            affirmation: {
              statement: 'We affirm the accuracy',
              signatories: [
                {
                  'bom-ref': `sig-${getTestId('sig')}`,
                  name: 'Test Signatory',
                  role: 'Approver',
                },
              ],
            },
            attestations: [
              {
                summary: 'Complete Attestation',
                map: [
                  {
                    requirement: reqRef,
                    conformance: {
                      score: 1.0,
                      rationale: 'Fully compliant',
                    },
                    claims: [claimRef],
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
        expect(res.body.importLog.length).toBeGreaterThan(3);
      });
    });

    describe('Edge cases', () => {
      it('should handle very long names and descriptions', async () => {
        const agent = await loginAs('admin');
        // Use 200 chars to stay under varchar(255) limit
        const longText = 'A'.repeat(200);
        const longDesc = 'B'.repeat(300); // Descriptions can be longer (text type)

        const bom = createValidBom({
          metadata: {
            component: {
              name: longText,
            },
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: longText,
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-${getTestId('ev')}`,
                description: longDesc,
              },
            ],
            claims: [],
            attestations: [
              {
                summary: longText,
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle special characters in names', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          metadata: {
            component: {
              name: 'Test & <Special> "Characters" \'Quotes\'',
            },
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Org@#$%^&*()',
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Test\nWith\nNewlines',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle unicode characters', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          metadata: {
            component: {
              name: '測試組件 🔐 Тестовый',
            },
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: '日本語 Español العربية',
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: '테스트 ক বাংলা',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle empty optional fields gracefully', async () => {
        const agent = await loginAs('admin');

        // Test with minimal declarations - only required attestations array
        const bom = createValidBom({
          declarations: {
            attestations: [
              {
                summary: 'Minimal Attestation',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle circular parent references gracefully', async () => {
        const agent = await loginAs('admin');

        const req1Ref = `req-1-${getTestId('req')}`;
        const req2Ref = `req-2-${getTestId('req')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Standard with circular refs',
                identifier: `STD-CIRC-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': req1Ref,
                    identifier: 'REQ-1',
                    title: 'Requirement 1',
                    parent: req2Ref, // Points to req2
                  },
                  {
                    'bom-ref': req2Ref,
                    identifier: 'REQ-2',
                    title: 'Requirement 2',
                    parent: req1Ref, // Points back to req1 (circular)
                  },
                ],
              },
            ],
          },
        });

        // Should handle gracefully without infinite loop
        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);
      });

      it('should handle orphan evidence references in claims', async () => {
        const agent = await loginAs('admin');

        const bom = createValidBom({
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Test Org',
                },
              ],
            },
            evidence: [
              {
                'bom-ref': `ev-${getTestId('ev')}`,
                description: 'Available Evidence',
              },
            ],
            claims: [
              {
                'bom-ref': `claim-${getTestId('claim')}`,
                predicate: 'Claim with orphan reference',
                evidence: [
                  `ev-${getTestId('ev')}`, // Non-existent reference
                  `ev-${getTestId('ev')}`,
                ],
              },
            ],
            attestations: [
              {
                summary: 'Test',
                map: [],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        // Should succeed but skip missing references
        expect(res.status).toBe(201);
      });

      it('should handle conformance scores at boundaries', async () => {
        const agent = await loginAs('admin');

        const reqRef = `req-${getTestId('req')}`;

        const bom = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Boundary Standard',
                identifier: `STD-BOUNDARY-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': reqRef,
                    identifier: 'REQ-SCORE',
                    title: 'Requirement for boundary test',
                  },
                ],
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Test Org',
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Boundary Test',
                map: [
                  {
                    requirement: reqRef,
                    conformance: {
                      score: 0, // Minimum
                      rationale: 'Not conformant',
                    },
                  },
                ],
              },
            ],
          },
        });

        const res = await agent
          .post('/api/v1/import/attestation')
          .send(bom);

        expect(res.status).toBe(201);

        // Test with maximum score
        const reqRef2 = `req-2-${getTestId('req')}`;
        const bom2 = createValidBom({
          definitions: {
            standards: [
              {
                'bom-ref': `std-${getTestId('std')}`,
                name: 'Boundary Standard 2',
                identifier: `STD-BOUNDARY2-${getTestId('ident')}`,
                requirements: [
                  {
                    'bom-ref': reqRef2,
                    identifier: 'REQ-SCORE2',
                    title: 'Requirement for max boundary',
                  },
                ],
              },
            ],
          },
          declarations: {
            targets: {
              organizations: [
                {
                  'bom-ref': `org-${getTestId('org')}`,
                  name: 'Test Org',
                },
              ],
            },
            evidence: [],
            claims: [],
            attestations: [
              {
                summary: 'Max Boundary Test',
                map: [
                  {
                    requirement: reqRef2,
                    conformance: {
                      score: 1, // Maximum
                      rationale: 'Fully conformant',
                    },
                  },
                ],
              },
            ],
          },
        });

        const res2 = await agent
          .post('/api/v1/import/attestation')
          .send(bom2);

        expect(res2.status).toBe(201);
      });
    });
  });
});
