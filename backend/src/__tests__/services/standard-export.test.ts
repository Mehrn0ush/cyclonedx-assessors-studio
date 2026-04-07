import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestStandard,
  createTestRequirement,
  createTestLevel,
  getTestDatabase,
} from '../helpers/setup.js';

// Hoisted mock ref so the factory can capture it
const mockGetDatabase = vi.hoisted(() => vi.fn());

vi.mock('../../db/connection.js', () => ({
  getDatabase: mockGetDatabase,
}));

// Import AFTER the mock is registered
import { generateStandardCycloneDX } from '../../services/standard-export.js';

describe('Standard Export', () => {
  beforeAll(async () => {
    await setupTestDb();
    // Point the mocked getDatabase() at the test PGlite instance
    mockGetDatabase.mockReturnValue(getTestDatabase());
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should generate valid CycloneDX JSON structure', async () => {
    const standard = await createTestStandard({
      identifier: 'TEST-STD-1',
      name: 'Test Standard',
      version: '1.0.0',
      description: 'A test standard',
      owner: 'Test Owner',
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);

    expect(bom).toBeDefined();
    expect(bom.$schema).toBe('http://cyclonedx.org/schema/bom-1.6.schema.json');
    expect(bom.bomFormat).toBe('CycloneDX');
    expect(bom.specVersion).toBe('1.6');
    expect(bom.serialNumber).toMatch(/^urn:uuid:/);
    expect(bom.version).toBe(1);
    expect(bom.metadata).toBeDefined();
    expect(bom.metadata.timestamp).toBeDefined();
    expect(bom.definitions).toBeDefined();
    expect(bom.definitions.standards).toBeDefined();
  });

  it('should include standard metadata in output', async () => {
    const standard = await createTestStandard({
      identifier: 'ASVS-4.0',
      name: 'Application Security Verification Standard',
      version: '4.0',
      description: 'OWASP ASVS standard',
      owner: 'OWASP',
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const cdxStandard = bom.definitions.standards[0];

    expect(cdxStandard['bom-ref']).toBe('ASVS-4.0');
    expect(cdxStandard.name).toBe('Application Security Verification Standard');
    expect(cdxStandard.version).toBe('4.0');
    expect(cdxStandard.description).toBe('OWASP ASVS standard');
    expect(cdxStandard.owner).toBe('OWASP');
  });

  it('should omit optional fields when not present', async () => {
    const standard = await createTestStandard({
      identifier: 'MINIMAL-STD',
      name: 'Minimal Standard',
      description: null,
      owner: null,
      version: null,
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const cdxStandard = bom.definitions.standards[0];

    expect(cdxStandard.description).toBeUndefined();
    expect(cdxStandard.owner).toBeUndefined();
    expect(cdxStandard.version).toBeUndefined();
  });

  it('should export requirements in topological order', async () => {
    const standard = await createTestStandard();

    const parent = await createTestRequirement(standard.id, {
      identifier: 'REQ-1',
      name: 'Parent',
    });
    const child1 = await createTestRequirement(standard.id, {
      identifier: 'REQ-2',
      name: 'Child 1',
      parentId: parent.id,
    });
    const child2 = await createTestRequirement(standard.id, {
      identifier: 'REQ-10',
      name: 'Child 2',
      parentId: parent.id,
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const reqs = bom.definitions.standards[0].requirements;

    expect(reqs).toHaveLength(3);
    expect(reqs[0].identifier).toBe('REQ-1');
    expect(reqs[1].identifier).toBe('REQ-2');
    expect(reqs[2].identifier).toBe('REQ-10');
  });

  it('should sort sibling requirements naturally', async () => {
    const standard = await createTestStandard();

    await createTestRequirement(standard.id, { identifier: '4.1.10' });
    await createTestRequirement(standard.id, { identifier: '4.1.2' });
    await createTestRequirement(standard.id, { identifier: '4.1.1' });
    await createTestRequirement(standard.id, { identifier: '4.2.1' });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const reqs = bom.definitions.standards[0].requirements;

    expect(reqs[0].identifier).toBe('4.1.1');
    expect(reqs[1].identifier).toBe('4.1.2');
    expect(reqs[2].identifier).toBe('4.1.10');
    expect(reqs[3].identifier).toBe('4.2.1');
  });

  it('should include requirement metadata', async () => {
    const standard = await createTestStandard();

    await createTestRequirement(standard.id, {
      identifier: 'REQ-1',
      name: 'Test Requirement',
      description: 'This is a test requirement',
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const req = bom.definitions.standards[0].requirements[0];

    expect(req['bom-ref']).toBe('REQ-1');
    expect(req.identifier).toBe('REQ-1');
    expect(req.title).toBe('Test Requirement');
    expect(req.text).toBe('This is a test requirement');
  });

  it('should set parent reference for child requirements', async () => {
    const standard = await createTestStandard();

    const parent = await createTestRequirement(standard.id, {
      identifier: 'PARENT-1',
    });
    await createTestRequirement(standard.id, {
      identifier: 'CHILD-1',
      parentId: parent.id,
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const reqs = bom.definitions.standards[0].requirements;

    const childReq = reqs.find((r: any) => r.identifier === 'CHILD-1');
    expect(childReq.parent).toBe('PARENT-1');
  });

  it('should handle OpenCRE references', async () => {
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id, {
      identifier: 'REQ-WITH-CRE',
      open_cre: 'CRE:123',
    });

    const req2 = await createTestRequirement(standard.id, {
      identifier: 'REQ-WITH-MULTIPLE',
      open_cre: 'CRE:456, CRE:789',
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const reqs = bom.definitions.standards[0].requirements;

    const creReq = reqs.find((r: any) => r.identifier === 'REQ-WITH-CRE');
    expect(creReq.openCre).toEqual(['CRE:123']);

    const multiCreReq = reqs.find((r: any) => r.identifier === 'REQ-WITH-MULTIPLE');
    expect(multiCreReq.openCre).toEqual(['CRE:456', 'CRE:789']);
  });

  it('should export levels sorted by identifier', async () => {
    const standard = await createTestStandard();

    const level3 = await createTestLevel(standard.id, { identifier: 'L3' });
    const level1 = await createTestLevel(standard.id, { identifier: 'L1' });
    const level2 = await createTestLevel(standard.id, { identifier: 'L2' });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const levels = bom.definitions.standards[0].levels;

    expect(levels[0].identifier).toBe('L1');
    expect(levels[1].identifier).toBe('L2');
    expect(levels[2].identifier).toBe('L3');
  });

  it('should include level metadata', async () => {
    const standard = await createTestStandard();

    await createTestLevel(standard.id, {
      identifier: 'L1',
      title: 'Level 1',
      description: 'The first level',
    });

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const level = bom.definitions.standards[0].levels[0];

    expect(level['bom-ref']).toBe('L1');
    expect(level.identifier).toBe('L1');
    expect(level.title).toBe('Level 1');
    expect(level.description).toBe('The first level');
  });

  it('should associate requirements with levels', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id, {
      identifier: 'REQ-1',
    });
    const req2 = await createTestRequirement(standard.id, {
      identifier: 'REQ-2',
    });
    const req3 = await createTestRequirement(standard.id, {
      identifier: 'REQ-3',
    });

    const level1 = await createTestLevel(standard.id, { identifier: 'L1' });
    const level2 = await createTestLevel(standard.id, { identifier: 'L2' });

    await db.insertInto('level_requirement').values({
      level_id: level1.id,
      requirement_id: req1.id,
    }).execute();

    await db.insertInto('level_requirement').values({
      level_id: level2.id,
      requirement_id: req1.id,
    }).execute();

    await db.insertInto('level_requirement').values({
      level_id: level2.id,
      requirement_id: req2.id,
    }).execute();

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const levels = bom.definitions.standards[0].levels;

    const l1 = levels.find((l: any) => l.identifier === 'L1');
    const l2 = levels.find((l: any) => l.identifier === 'L2');

    expect(l1.requirements).toEqual(['REQ-1']);
    expect(l2.requirements).toEqual(['REQ-1', 'REQ-2']);
  });

  it('should sort level requirements alphabetically', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id, { identifier: 'REQ-10' });
    const req2 = await createTestRequirement(standard.id, { identifier: 'REQ-1' });
    const req3 = await createTestRequirement(standard.id, { identifier: 'REQ-2' });

    const level = await createTestLevel(standard.id, { identifier: 'L1' });

    // Insert in non-sorted order
    await db.insertInto('level_requirement').values({
      level_id: level.id,
      requirement_id: req1.id,
    }).execute();

    await db.insertInto('level_requirement').values({
      level_id: level.id,
      requirement_id: req2.id,
    }).execute();

    await db.insertInto('level_requirement').values({
      level_id: level.id,
      requirement_id: req3.id,
    }).execute();

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const level1 = bom.definitions.standards[0].levels[0];

    expect(level1.requirements).toEqual(['REQ-1', 'REQ-2', 'REQ-10']);
  });

  it('should handle standard with no requirements', async () => {
    const standard = await createTestStandard();

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const cdxStandard = bom.definitions.standards[0];

    expect(cdxStandard.requirements).toBeUndefined();
  });

  it('should handle standard with no levels', async () => {
    const standard = await createTestStandard();
    await createTestRequirement(standard.id);

    const jsonStr = await generateStandardCycloneDX(standard.id);
    const bom = JSON.parse(jsonStr);
    const cdxStandard = bom.definitions.standards[0];

    expect(cdxStandard.levels).toBeUndefined();
  });

  it('should generate unique serial numbers', async () => {
    const standard = await createTestStandard();

    const json1 = await generateStandardCycloneDX(standard.id);
    const json2 = await generateStandardCycloneDX(standard.id);

    const bom1 = JSON.parse(json1);
    const bom2 = JSON.parse(json2);

    expect(bom1.serialNumber).not.toBe(bom2.serialNumber);
  });
});
