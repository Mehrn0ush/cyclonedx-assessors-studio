import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestStandard,
  createTestRequirement,
  createTestLevel,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Standards', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should create a standard', async () => {
    const db = getTestDatabase();
    const standardId = uuidv4();

    await db.insertInto('standard').values({
      id: standardId,
      identifier: 'ASVS-4.0',
      name: 'Application Security Verification Standard',
      description: 'OWASP ASVS',
      owner: 'OWASP',
      version: '4.0',
    }).execute();

    const standard = await db.selectFrom('standard')
      .where('id', '=', standardId)
      .selectAll()
      .executeTakeFirst();

    expect(standard).toBeDefined();
    expect(standard!.identifier).toBe('ASVS-4.0');
    expect(standard!.name).toBe('Application Security Verification Standard');
    expect(standard!.owner).toBe('OWASP');
  });

  it('should create a standard with helper function', async () => {
    const standard = await createTestStandard({
      identifier: 'ISO-27001',
      name: 'Information Security Management',
      owner: 'ISO',
    });

    const db = getTestDatabase();
    const result = await db.selectFrom('standard')
      .where('id', '=', standard.id)
      .selectAll()
      .executeTakeFirst();

    expect(result).toBeDefined();
    expect(result!.identifier).toBe('ISO-27001');
  });

  it('should create requirements for a standard', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id, { name: 'Requirement 1' });
    const req2 = await createTestRequirement(standard.id, { name: 'Requirement 2' });

    const requirements = await db.selectFrom('requirement')
      .where('standard_id', '=', standard.id)
      .selectAll()
      .execute();

    expect(requirements).toHaveLength(2);
    expect(requirements.map(r => r.name)).toContain('Requirement 1');
    expect(requirements.map(r => r.name)).toContain('Requirement 2');
  });

  it('should support requirement hierarchy', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const parent = await createTestRequirement(standard.id, { name: 'Parent Requirement' });
    const child = await createTestRequirement(standard.id, {
      name: 'Child Requirement',
      parentId: parent.id,
    });

    const childReq = await db.selectFrom('requirement')
      .where('id', '=', child.id)
      .selectAll()
      .executeTakeFirst();

    expect(childReq!.parent_id).toBe(parent.id);
  });

  it('should create levels for a standard', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const level1 = await createTestLevel(standard.id, { identifier: 'L1', title: 'Level 1' });
    const level2 = await createTestLevel(standard.id, { identifier: 'L2', title: 'Level 2' });
    const level3 = await createTestLevel(standard.id, { identifier: 'L3', title: 'Level 3' });

    const levels = await db.selectFrom('level')
      .where('standard_id', '=', standard.id)
      .selectAll()
      .execute();

    expect(levels).toHaveLength(3);
    expect(levels.map(l => l.identifier)).toContain('L1');
    expect(levels.map(l => l.identifier)).toContain('L2');
    expect(levels.map(l => l.identifier)).toContain('L3');
  });

  it('should associate requirements with levels', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id, { name: 'Req 1' });
    const req2 = await createTestRequirement(standard.id, { name: 'Req 2' });
    const req3 = await createTestRequirement(standard.id, { name: 'Req 3' });

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

    const level1Reqs = await db.selectFrom('level_requirement')
      .where('level_id', '=', level1.id)
      .selectAll()
      .execute();

    const level2Reqs = await db.selectFrom('level_requirement')
      .where('level_id', '=', level2.id)
      .selectAll()
      .execute();

    expect(level1Reqs).toHaveLength(1);
    expect(level2Reqs).toHaveLength(2);
  });

  it('should build a requirement tree with parent and children', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const root = await createTestRequirement(standard.id, { name: 'Root' });
    const child1 = await createTestRequirement(standard.id, {
      name: 'Child 1',
      parentId: root.id,
    });
    const child2 = await createTestRequirement(standard.id, {
      name: 'Child 2',
      parentId: root.id,
    });
    const grandchild = await createTestRequirement(standard.id, {
      name: 'Grandchild',
      parentId: child1.id,
    });

    const allReqs = await db.selectFrom('requirement')
      .where('standard_id', '=', standard.id)
      .selectAll()
      .execute();

    expect(allReqs).toHaveLength(4);

    const rootReq = allReqs.find(r => r.id === root.id);
    const children = allReqs.filter(r => r.parent_id === root.id);

    expect(rootReq!.parent_id).toBeNull();
    expect(children).toHaveLength(2);
  });

  it('should enforce unique identifier within a standard', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    await createTestRequirement(standard.id, { identifier: 'REQ-1' });

    try {
      await createTestRequirement(standard.id, { identifier: 'REQ-1' });
      expect.fail('Should have thrown a duplicate identifier error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should allow same identifier in different standards', async () => {
    const db = getTestDatabase();
    const standard1 = await createTestStandard();
    const standard2 = await createTestStandard();

    const req1 = await createTestRequirement(standard1.id, { identifier: 'REQ-1' });
    const req2 = await createTestRequirement(standard2.id, { identifier: 'REQ-1' });

    expect(req1.id).not.toBe(req2.id);

    const result1 = await db.selectFrom('requirement')
      .where('id', '=', req1.id)
      .selectAll()
      .executeTakeFirst();

    const result2 = await db.selectFrom('requirement')
      .where('id', '=', req2.id)
      .selectAll()
      .executeTakeFirst();

    expect(result1!.identifier).toBe(result2!.identifier);
    expect(result1!.standard_id).not.toBe(result2!.standard_id);
  });

  it('should cascade delete requirements when standard is deleted', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();

    const req1 = await createTestRequirement(standard.id);
    const req2 = await createTestRequirement(standard.id);

    await db.deleteFrom('standard')
      .where('id', '=', standard.id)
      .execute();

    const remainingReqs = await db.selectFrom('requirement')
      .where('standard_id', '=', standard.id)
      .selectAll()
      .execute();

    expect(remainingReqs).toHaveLength(0);
  });

  it('should support OpenCRE references in requirements', async () => {
    const db = getTestDatabase();
    const standard = await createTestStandard();
    const requirementId = uuidv4();
    const openCreRef = 'CRE:551';

    await db.insertInto('requirement').values({
      id: requirementId,
      identifier: 'REQ-WITH-CRE',
      name: 'Requirement with CRE',
      standard_id: standard.id,
      open_cre: openCreRef,
    }).execute();

    const req = await db.selectFrom('requirement')
      .where('id', '=', requirementId)
      .selectAll()
      .executeTakeFirst();

    expect(req!.open_cre).toBe(openCreRef);
  });
});
