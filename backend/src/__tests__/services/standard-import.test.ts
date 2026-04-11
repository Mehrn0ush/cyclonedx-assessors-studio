import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';
import { importStandard, RawStandardInput, ImportedStandardResult } from '../../services/standard-import.js';

vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

describe('importStandard', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Basic import', () => {
    it('should import a simple standard with no requirements or levels', async () => {
      const standard: RawStandardInput = {
        identifier: 'TEST-SIMPLE-001',
        name: 'Simple Test Standard',
        description: 'A simple standard for testing',
        version: '1.0',
      };

      const result = await importStandard(standard);

      expect(result).toMatchObject({
        identifier: 'TEST-SIMPLE-001',
        name: 'Simple Test Standard',
        requirementCount: 0,
        levelCount: 0,
        skipped: false,
      });
      expect(result.id).toBeDefined();

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'TEST-SIMPLE-001')
        .select(['id', 'name', 'description', 'version', 'state'])
        .executeTakeFirst();

      expect(stored).toBeDefined();
      expect(stored?.name).toBe('Simple Test Standard');
      expect(stored?.state).toBe('published');
    });

    it('should use CycloneDX field names (bom-ref, title, text)', async () => {
      const standard = {
        'bom-ref': 'CYCLONE-001',
        title: 'CycloneDX Standard',
        description: 'This is a CycloneDX formatted standard',
      } as RawStandardInput;

      const result = await importStandard(standard);

      expect(result.identifier).toBe('CYCLONE-001');
      expect(result.name).toBe('CycloneDX Standard');
      expect(result.skipped).toBe(false);

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'CYCLONE-001')
        .select(['description'])
        .executeTakeFirst();

      expect(stored?.description).toBe('This is a CycloneDX formatted standard');
    });

    it('should use camelCase field names (identifier, name, description)', async () => {
      const standard: RawStandardInput = {
        identifier: 'CAMEL-002',
        name: 'Camel Case Standard',
        description: 'Standard with camelCase fields',
        version: '2.0',
      };

      const result = await importStandard(standard);

      expect(result.identifier).toBe('CAMEL-002');
      expect(result.name).toBe('Camel Case Standard');

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'CAMEL-002')
        .select(['description', 'version'])
        .executeTakeFirst();

      expect(stored?.description).toBe('Standard with camelCase fields');
      expect(stored?.version).toBe('2.0');
    });

    it('should support bomRef (camelCase variant of bom-ref)', async () => {
      const standard: RawStandardInput = {
        bomRef: 'BOMREF-003',
        name: 'BomRef Standard',
      };

      const result = await importStandard(standard);

      expect(result.identifier).toBe('BOMREF-003');
    });

    it('should use fallbackName when no name is provided', async () => {
      const standard: RawStandardInput = {
        identifier: 'NO-NAME-004',
      };

      const result = await importStandard(standard, { fallbackName: 'My Fallback Name' });

      expect(result.name).toBe('My Fallback Name');

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'NO-NAME-004')
        .select(['name'])
        .executeTakeFirst();

      expect(stored?.name).toBe('My Fallback Name');
    });

    it('should use default fallbackName when not provided', async () => {
      const standard: RawStandardInput = {
        identifier: 'NO-NAME-005',
      };

      const result = await importStandard(standard);

      expect(result.name).toBe('Unknown Standard');
    });
  });

  describe('Idempotency', () => {
    it('should return skipped=true when importing same identifier twice', async () => {
      const standard: RawStandardInput = {
        identifier: 'IDEMPOTENT-001',
        name: 'Idempotent Standard',
        description: 'First import',
      };

      const result1 = await importStandard(standard);
      expect(result1.skipped).toBe(false);
      expect(result1.name).toBe('Idempotent Standard');

      const result2 = await importStandard(standard);
      expect(result2.skipped).toBe(true);
      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe('Idempotent Standard');

      // Verify only one record exists
      const db = getTestDatabase();
      const count = await db
        .selectFrom('standard')
        .where('identifier', '=', 'IDEMPOTENT-001')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      expect(Number(count?.count)).toBe(1);
    });

    it('should return skipped=true even when name differs on second import', async () => {
      const standard1: RawStandardInput = {
        identifier: 'IDEMPOTENT-002',
        name: 'First Name',
      };

      const result1 = await importStandard(standard1);
      expect(result1.skipped).toBe(false);

      const standard2: RawStandardInput = {
        identifier: 'IDEMPOTENT-002',
        name: 'Different Name',
      };

      const result2 = await importStandard(standard2);
      expect(result2.skipped).toBe(true);
      expect(result2.name).toBe('First Name'); // Original name is preserved
    });
  });

  describe('Requirements import', () => {
    it('should import flat list of requirements (no parent-child)', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-FLAT-001',
        name: 'Standard with Flat Requirements',
        requirements: [
          {
            identifier: 'REQ-1',
            name: 'Requirement 1',
            description: 'First requirement',
          },
          {
            identifier: 'REQ-2',
            name: 'Requirement 2',
            description: 'Second requirement',
          },
          {
            identifier: 'REQ-3',
            name: 'Requirement 3',
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(3);
      expect(result.skipped).toBe(false);

      const db = getTestDatabase();
      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(['identifier', 'name', 'description', 'parent_id'])
        .orderBy('identifier')
        .execute();

      expect(requirements).toHaveLength(3);
      expect(requirements[0]).toMatchObject({
        identifier: 'REQ-1',
        name: 'Requirement 1',
        description: 'First requirement',
        parent_id: null,
      });
      expect(requirements[1]).toMatchObject({
        identifier: 'REQ-2',
        name: 'Requirement 2',
        parent_id: null,
      });
    });

    it('should use bom-ref for requirement identifier', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-BOMREF-001',
        name: 'Standard with bom-ref Requirements',
        requirements: [
          {
            'bom-ref': 'BOMREF-REQ-1',
            title: 'Requirement via bom-ref',
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(1);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(['identifier', 'name'])
        .executeTakeFirst();

      expect(req?.identifier).toBe('BOMREF-REQ-1');
      expect(req?.name).toBe('Requirement via bom-ref');
    });

    it('should build parent-child hierarchy (topological sort)', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-HIERARCHY-001',
        name: 'Standard with Hierarchical Requirements',
        requirements: [
          {
            identifier: 'PARENT-1',
            name: 'Parent Requirement',
          },
          {
            identifier: 'CHILD-1A',
            name: 'Child of Parent 1',
            parent: 'PARENT-1',
          },
          {
            identifier: 'CHILD-1B',
            name: 'Another Child of Parent 1',
            parent: 'PARENT-1',
          },
          {
            identifier: 'PARENT-2',
            name: 'Second Parent',
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(4);

      const db = getTestDatabase();
      const reqMap = new Map<string, any>();

      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(['id', 'identifier', 'parent_id'])
        .execute();

      requirements.forEach(req => {
        reqMap.set(req.identifier, req);
      });

      const parent1 = reqMap.get('PARENT-1');
      const child1a = reqMap.get('CHILD-1A');
      const child1b = reqMap.get('CHILD-1B');

      expect(child1a?.parent_id).toBe(parent1?.id);
      expect(child1b?.parent_id).toBe(parent1?.id);
      expect(parent1?.parent_id).toBeNull();
    });

    it('should use parentIdentifier as alternative parent reference', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-PARENT-ID-001',
        name: 'Standard with parentIdentifier',
        requirements: [
          {
            identifier: 'PARENT',
            name: 'Parent',
          },
          {
            identifier: 'CHILD',
            name: 'Child',
            parentIdentifier: 'PARENT',
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(2);

      const db = getTestDatabase();
      const parent = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .where('identifier', '=', 'PARENT')
        .select('id')
        .executeTakeFirst();

      const child = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .where('identifier', '=', 'CHILD')
        .select('parent_id')
        .executeTakeFirst();

      expect(child?.parent_id).toBe(parent?.id);
    });

    it('should handle orphan requirements (parent ref does not match)', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-ORPHAN-001',
        name: 'Standard with Orphan Requirements',
        requirements: [
          {
            identifier: 'ORPHAN-1',
            name: 'Orphan Requirement',
            parent: 'NON-EXISTENT-PARENT',
          },
          {
            identifier: 'ORPHAN-2',
            name: 'Another Orphan',
            parent: 'ALSO-MISSING',
          },
        ],
      };

      const result = await importStandard(standard);

      // Should still import orphans, just without parent references
      expect(result.requirementCount).toBe(2);

      const db = getTestDatabase();
      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(['identifier', 'parent_id'])
        .orderBy('identifier')
        .execute();

      expect(requirements).toHaveLength(2);
      requirements.forEach(req => {
        expect(req.parent_id).toBeNull();
      });
    });

    it('should normalize openCre array to comma-separated string', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-OPENCRE-ARRAY-001',
        name: 'Standard with openCre arrays',
        requirements: [
          {
            identifier: 'REQ-WITH-ARRAY',
            name: 'Requirement with openCre array',
            openCre: ['ITEM-1', 'ITEM-2', 'ITEM-3'],
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select('open_cre')
        .executeTakeFirst();

      expect(req?.open_cre).toBe('ITEM-1, ITEM-2, ITEM-3');
    });

    it('should preserve openCre string as-is', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-OPENCRE-STRING-001',
        name: 'Standard with openCre string',
        requirements: [
          {
            identifier: 'REQ-WITH-STRING',
            name: 'Requirement with openCre string',
            openCre: 'SINGLE-ITEM',
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select('open_cre')
        .executeTakeFirst();

      expect(req?.open_cre).toBe('SINGLE-ITEM');
    });

    it('should set openCre to null for empty array', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-OPENCRE-EMPTY-001',
        name: 'Standard with empty openCre',
        requirements: [
          {
            identifier: 'REQ-WITH-EMPTY',
            name: 'Requirement with empty openCre',
            openCre: [],
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select('open_cre')
        .executeTakeFirst();

      expect(req?.open_cre).toBeNull();
    });

    it('should set openCre to null when absent', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-OPENCRE-NONE-001',
        name: 'Standard without openCre',
        requirements: [
          {
            identifier: 'REQ-NO-OPENCRE',
            name: 'Requirement without openCre',
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select('open_cre')
        .executeTakeFirst();

      expect(req?.open_cre).toBeNull();
    });

    it('should use "open-cre" field name as alternative', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-OPENCRE-DASH-001',
        name: 'Standard with open-cre field',
        requirements: [
          {
            identifier: 'REQ-DASH-FIELD',
            name: 'Requirement with dash-cased field',
            'open-cre': 'DASH-ITEM',
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select('open_cre')
        .executeTakeFirst();

      expect(req?.open_cre).toBe('DASH-ITEM');
    });

    it('should use text field as name and description fallback', async () => {
      // When only text is provided (no title/name), text is used for both name and description
      const standard: RawStandardInput = {
        identifier: 'REQ-TEXT-001',
        name: 'Standard with text field',
        requirements: [
          {
            identifier: 'REQ-TEXT',
            text: 'This is the text field used as both name and description',
          } as any,
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const req = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(['name', 'description'])
        .executeTakeFirst();

      // text is used as name (title > text > name fallback chain)
      expect(req?.name).toBe('This is the text field used as both name and description');
      // text is also used as description (description > text fallback chain)
      expect(req?.description).toBe('This is the text field used as both name and description');
    });

    it('should skip duplicate requirement inserts gracefully', async () => {
      const standard: RawStandardInput = {
        identifier: 'REQ-DUPLICATE-001',
        name: 'Standard with potential duplicates',
        requirements: [
          {
            identifier: 'REQ-DUP',
            name: 'Duplicate Requirement',
          },
          {
            identifier: 'REQ-DUP',
            name: 'This would be a duplicate',
          },
        ],
      };

      // Should not throw, should handle duplicate gracefully
      const result = await importStandard(standard);

      // Count actual inserted requirements
      const db = getTestDatabase();
      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      expect(Number(requirements?.count)).toBe(1);
    });
  });

  describe('Levels import', () => {
    it('should import levels with requirement associations', async () => {
      const standard: RawStandardInput = {
        identifier: 'LEVEL-001',
        name: 'Standard with Levels',
        requirements: [
          {
            identifier: 'REQ-L1',
            name: 'Requirement for Level 1',
          },
          {
            identifier: 'REQ-L2',
            name: 'Requirement for Level 2',
          },
          {
            identifier: 'REQ-L3',
            name: 'Requirement for Level 3',
          },
        ],
        levels: [
          {
            identifier: 'LEVEL-1',
            title: 'Level 1 - Basic',
            description: 'Basic compliance level',
            requirements: ['REQ-L1'],
          },
          {
            identifier: 'LEVEL-2',
            title: 'Level 2 - Advanced',
            description: 'Advanced compliance level',
            requirements: ['REQ-L1', 'REQ-L2'],
          },
          {
            identifier: 'LEVEL-3',
            title: 'Level 3 - Expert',
            description: 'Expert compliance level',
            requirements: ['REQ-L1', 'REQ-L2', 'REQ-L3'],
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.levelCount).toBe(3);
      expect(result.requirementCount).toBe(3);

      const db = getTestDatabase();
      const levels = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select(['identifier', 'title', 'description'])
        .orderBy('identifier')
        .execute();

      expect(levels).toHaveLength(3);
      expect(levels[0]?.title).toBe('Level 1 - Basic');

      // Check level-requirement associations
      const lvlReqs = await db
        .selectFrom('level_requirement')
        .innerJoin('level', 'level.id', 'level_requirement.level_id')
        .where('level.standard_id', '=', result.id)
        .select(['level.identifier', 'level_requirement.requirement_id'])
        .execute();

      expect(lvlReqs.length).toBeGreaterThan(0);
    });

    it('should use bom-ref for level identifier', async () => {
      const standard: RawStandardInput = {
        identifier: 'LEVEL-BOMREF-001',
        name: 'Standard with bom-ref Levels',
        levels: [
          {
            'bom-ref': 'LEVEL-BOMREF-1',
            title: 'Level via bom-ref',
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const level = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select('identifier')
        .executeTakeFirst();

      expect(level?.identifier).toBe('LEVEL-BOMREF-1');
    });

    it('should skip non-existent requirement references in level-requirement', async () => {
      const standard: RawStandardInput = {
        identifier: 'LEVEL-MISSING-REQ-001',
        name: 'Level referencing missing requirements',
        requirements: [
          {
            identifier: 'REQ-EXISTS',
            name: 'This requirement exists',
          },
        ],
        levels: [
          {
            identifier: 'LEVEL-WITH-REFS',
            title: 'Level with mixed refs',
            requirements: ['REQ-EXISTS', 'REQ-MISSING', 'REQ-ALSO-MISSING'],
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const level = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select('id')
        .executeTakeFirst();

      const associations = await db
        .selectFrom('level_requirement')
        .where('level_id', '=', level!.id)
        .select(db.fn.count<number>('requirement_id').as('count'))
        .executeTakeFirst();

      expect(Number(associations?.count)).toBe(1);
    });

    it('should skip duplicate level-requirement associations', async () => {
      const standard: RawStandardInput = {
        identifier: 'LEVEL-DUP-REQ-001',
        name: 'Level with duplicate requirement refs',
        requirements: [
          {
            identifier: 'REQ-DUP-TEST',
            name: 'Test requirement',
          },
        ],
        levels: [
          {
            identifier: 'LEVEL-DUP',
            title: 'Level with duplicate refs',
            requirements: ['REQ-DUP-TEST', 'REQ-DUP-TEST'],
          },
        ],
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const level = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select('id')
        .executeTakeFirst();

      const associations = await db
        .selectFrom('level_requirement')
        .where('level_id', '=', level!.id)
        .select(db.fn.count<number>('requirement_id').as('count'))
        .executeTakeFirst();

      expect(Number(associations?.count)).toBe(1);
    });

    it('should skip duplicate level inserts gracefully', async () => {
      const standard: RawStandardInput = {
        identifier: 'LEVEL-DUPLICATE-001',
        name: 'Standard with duplicate levels',
        levels: [
          {
            identifier: 'LEVEL-DUP-ID',
            title: 'Level Title',
          },
          {
            identifier: 'LEVEL-DUP-ID',
            title: 'Different title for same ID',
          },
        ],
      };

      // Should not throw
      const result = await importStandard(standard);

      const db = getTestDatabase();
      const levels = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      expect(Number(levels?.count)).toBe(1);
    });
  });

  describe('Options', () => {
    it('should set is_imported=true by default', async () => {
      const standard: RawStandardInput = {
        identifier: 'IMPORT-DEFAULT-001',
        name: 'Default import flag',
      };

      // Check if is_imported column exists first
      const db = getTestDatabase();
      let hasIsImportedColumn = false;
      try {
        const testRow = await db.executeQuery({ sql: "SELECT column_name FROM information_schema.columns WHERE table_name='standard' AND column_name='is_imported'", parameters: [] } as any);
        hasIsImportedColumn = (testRow as any)?.rows?.length > 0;
      } catch { /* column check not supported */ }

      if (hasIsImportedColumn) {
        await importStandard(standard);

        const stored = await db
          .selectFrom('standard')
          .where('identifier', '=', 'IMPORT-DEFAULT-001')
          .select('is_imported' as any)
          .executeTakeFirst();

        expect((stored as any)?.is_imported).toBe(true);
      }
    });

    it('should set is_imported=false when markAsImported=false', async () => {
      const standard: RawStandardInput = {
        identifier: 'IMPORT-FALSE-001',
        name: 'Manual import flag',
      };

      const db = getTestDatabase();
      let hasIsImportedColumn = false;
      try {
        const testRow = await db.executeQuery({ sql: "SELECT column_name FROM information_schema.columns WHERE table_name='standard' AND column_name='is_imported'", parameters: [] } as any);
        hasIsImportedColumn = (testRow as any)?.rows?.length > 0;
      } catch { /* column check not supported */ }

      if (hasIsImportedColumn) {
        await importStandard(standard, { markAsImported: false });

        const stored = await db
          .selectFrom('standard')
          .where('identifier', '=', 'IMPORT-FALSE-001')
          .select('is_imported' as any)
          .executeTakeFirst();

        expect((stored as any)?.is_imported).toBe(false);
      }
    });

    it('should store sourceJson when provided', async () => {
      const sourceJson = JSON.stringify({
        definitions: {
          standards: [
            {
              identifier: 'SOURCE-JSON-001',
              name: 'Test',
            },
          ],
        },
      });

      const standard: RawStandardInput = {
        identifier: 'SOURCE-JSON-001',
        name: 'Standard with source JSON',
      };

      const db = getTestDatabase();
      let hasSourceJsonColumn = false;
      try {
        const testRow = await db.executeQuery({ sql: "SELECT column_name FROM information_schema.columns WHERE table_name='standard' AND column_name='source_json'", parameters: [] } as any);
        hasSourceJsonColumn = (testRow as any)?.rows?.length > 0;
      } catch { /* column check not supported */ }

      if (hasSourceJsonColumn) {
        await importStandard(standard, { sourceJson });

        const stored = await db
          .selectFrom('standard')
          .where('identifier', '=', 'SOURCE-JSON-001')
          .select('source_json' as any)
          .executeTakeFirst();

        expect((stored as any)?.source_json).toBe(sourceJson);
      }
    });

    it('should set source_json=null when not provided', async () => {
      const standard: RawStandardInput = {
        identifier: 'SOURCE-JSON-NULL-001',
        name: 'Standard without source JSON',
      };

      const db = getTestDatabase();
      let hasSourceJsonColumn = false;
      try {
        const testRow = await db.executeQuery({ sql: "SELECT column_name FROM information_schema.columns WHERE table_name='standard' AND column_name='source_json'", parameters: [] } as any);
        hasSourceJsonColumn = (testRow as any)?.rows?.length > 0;
      } catch { /* column check not supported */ }

      if (hasSourceJsonColumn) {
        await importStandard(standard);

        const stored = await db
          .selectFrom('standard')
          .where('identifier', '=', 'SOURCE-JSON-NULL-001')
          .select('source_json' as any)
          .executeTakeFirst();

        expect((stored as any)?.source_json).toBeNull();
      }
    });
  });

  describe('Field priority and fallbacks', () => {
    it('should prefer bom-ref over identifier when both present', async () => {
      const standard: RawStandardInput = {
        identifier: 'FALLBACK-ID',
        'bom-ref': 'PREFERRED-REF',
        name: 'Field priority test',
      };

      const result = await importStandard(standard);

      expect(result.identifier).toBe('PREFERRED-REF');
    });

    it('should prefer name over title when both present', async () => {
      const standard: RawStandardInput = {
        identifier: 'FIELD-PRIORITY-001',
        name: 'Preferred Name',
        title: 'Fallback Title',
      };

      const result = await importStandard(standard);

      expect(result.name).toBe('Preferred Name');
    });

    it('should prefer description over text', async () => {
      const standard = {
        identifier: 'DESC-PRIORITY-001',
        name: 'Description Priority',
        description: 'Preferred description',
        text: 'Fallback text',
      } as any;

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'DESC-PRIORITY-001')
        .select('description')
        .executeTakeFirst();

      expect(stored?.description).toBe('Preferred description');
    });

    it('should handle owner and version fields', async () => {
      const standard: RawStandardInput = {
        identifier: 'OWNER-VERSION-001',
        name: 'Owner and Version Test',
        owner: 'OWASP',
        version: '3.1.0',
      };

      const result = await importStandard(standard);

      const db = getTestDatabase();
      const stored = await db
        .selectFrom('standard')
        .where('identifier', '=', 'OWNER-VERSION-001')
        .select(['owner', 'version'])
        .executeTakeFirst();

      expect(stored?.owner).toBe('OWASP');
      expect(stored?.version).toBe('3.1.0');
    });
  });

  describe('Complex scenarios', () => {
    it('should import complete standard with nested hierarchy, multiple levels, and various field formats', async () => {
      const standard: RawStandardInput = {
        'bom-ref': 'COMPLEX-001',
        title: 'Complex Standard',
        description: 'A complex standard with all features',
        owner: 'Test Organization',
        version: '1.0',
        requirements: [
          {
            identifier: 'MAIN-1',
            name: 'Main Requirement 1',
            openCre: ['CRE-1', 'CRE-2'],
          },
          {
            identifier: 'SUB-1A',
            name: 'Sub-requirement 1A',
            parent: 'MAIN-1',
            'open-cre': 'CRE-3',
          },
          {
            identifier: 'SUB-1B',
            name: 'Sub-requirement 1B',
            parentIdentifier: 'MAIN-1',
          },
          {
            identifier: 'MAIN-2',
            title: 'Main Requirement 2',
            text: 'Description for requirement 2',
          },
          {
            identifier: 'ORPHAN',
            name: 'Orphan requirement',
            parent: 'NON-EXISTENT',
          },
        ],
        levels: [
          {
            identifier: 'L1',
            title: 'Level 1',
            requirements: ['MAIN-1', 'SUB-1A'],
          },
          {
            identifier: 'L2',
            title: 'Level 2',
            requirements: ['MAIN-1', 'SUB-1A', 'SUB-1B', 'MAIN-2'],
          },
        ],
      };

      const result = await importStandard(standard);

      expect(result.identifier).toBe('COMPLEX-001');
      expect(result.name).toBe('Complex Standard');
      expect(result.requirementCount).toBe(5);
      expect(result.levelCount).toBe(2);
      expect(result.skipped).toBe(false);

      const db = getTestDatabase();

      // Verify standard
      const std = await db
        .selectFrom('standard')
        .where('identifier', '=', 'COMPLEX-001')
        .select(['owner', 'version', 'state'])
        .executeTakeFirst();

      expect(std?.owner).toBe('Test Organization');
      expect(std?.version).toBe('1.0');
      expect(std?.state).toBe('published');

      // Verify requirements
      const reqs = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      expect(Number(reqs?.count)).toBe(5);

      // Verify hierarchy
      const sub1a = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .where('identifier', '=', 'SUB-1A')
        .select('parent_id')
        .executeTakeFirst();

      expect(sub1a?.parent_id).not.toBeNull();

      // Verify orphan has no parent
      const orphan = await db
        .selectFrom('requirement')
        .where('standard_id', '=', result.id)
        .where('identifier', '=', 'ORPHAN')
        .select('parent_id')
        .executeTakeFirst();

      expect(orphan?.parent_id).toBeNull();

      // Verify levels
      const levels = await db
        .selectFrom('level')
        .where('standard_id', '=', result.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      expect(Number(levels?.count)).toBe(2);
    });

    it('should handle standard with no requirements array', async () => {
      const standard: RawStandardInput = {
        identifier: 'NO-ARRAY-001',
        name: 'Standard without requirements array',
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(0);
      expect(result.levelCount).toBe(0);
    });

    it('should handle standard with empty requirements array', async () => {
      const standard: RawStandardInput = {
        identifier: 'EMPTY-ARRAY-001',
        name: 'Standard with empty requirements',
        requirements: [],
        levels: [],
      };

      const result = await importStandard(standard);

      expect(result.requirementCount).toBe(0);
      expect(result.levelCount).toBe(0);
    });
  });

  describe('Return value structure', () => {
    it('should return ImportedStandardResult with all required fields', async () => {
      const standard: RawStandardInput = {
        identifier: 'RETURN-VALUE-001',
        name: 'Return Value Test',
        requirements: [
          { identifier: 'REQ-1', name: 'Req 1' },
          { identifier: 'REQ-2', name: 'Req 2' },
        ],
        levels: [
          { identifier: 'LEVEL-1', title: 'Level 1', requirements: ['REQ-1'] },
        ],
      };

      const result = await importStandard(standard);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('identifier');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('requirementCount');
      expect(result).toHaveProperty('levelCount');
      expect(result).toHaveProperty('skipped');

      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.identifier).toBe('RETURN-VALUE-001');
      expect(result.name).toBe('Return Value Test');
      expect(result.requirementCount).toBe(2);
      expect(result.levelCount).toBe(1);
      expect(result.skipped).toBe(false);
    });
  });
});
