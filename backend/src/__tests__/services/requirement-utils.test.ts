import { describe, it, expect } from 'vitest';
import {
  compareIdentifiers,
  topologicalSort,
  buildRequirementTree,
  RequirementTreeNode,
} from '../../services/requirement-utils.js';
import { v4 as uuidv4 } from 'uuid';

describe('Requirement Utils', () => {
  describe('compareIdentifiers', () => {
    it('should sort alphanumeric identifiers naturally', () => {
      const identifiers = ['REQ-10', 'REQ-2', 'REQ-1', 'REQ-20'];
      const sorted = identifiers.sort(compareIdentifiers);

      expect(sorted).toEqual(['REQ-1', 'REQ-2', 'REQ-10', 'REQ-20']);
    });

    it('should be case insensitive', () => {
      const identifiers = ['AM1.2', 'am3.5', 'AM10.1', 'am1.1'];
      const sorted = identifiers.sort(compareIdentifiers);

      expect(sorted).toEqual(['am1.1', 'AM1.2', 'am3.5', 'AM10.1']);
    });

    it('should handle ASVS-style identifiers', () => {
      const identifiers = ['4.1.1', '4.1.10', '4.2.1', '4.1.2'];
      const sorted = identifiers.sort(compareIdentifiers);

      expect(sorted).toEqual(['4.1.1', '4.1.2', '4.1.10', '4.2.1']);
    });

    it('should handle empty strings', () => {
      const result = compareIdentifiers('', 'REQ-1');
      expect(result).toBeLessThan(0);
    });

    it('should handle null/undefined by treating as empty string', () => {
      const result = compareIdentifiers('REQ-1', '');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('topologicalSort', () => {
    it('should sort requirements with parents before children', () => {
      const id1 = uuidv4();
      const id2 = uuidv4();
      const id3 = uuidv4();

      const requirements = [
        { id: id2, parent_id: id1, identifier: 'CHILD' },
        { id: id1, parent_id: null, identifier: 'PARENT' },
        { id: id3, parent_id: id1, identifier: 'CHILD2' },
      ];

      const sorted = topologicalSort(requirements);

      expect(sorted[0].id).toBe(id1); // parent first
      expect([sorted[1].id, sorted[2].id]).toContain(id2);
      expect([sorted[1].id, sorted[2].id]).toContain(id3);
    });

    it('should sort siblings alphabetically by identifier', () => {
      const parentId = uuidv4();
      const child1Id = uuidv4();
      const child2Id = uuidv4();
      const child3Id = uuidv4();

      const requirements = [
        { id: parentId, parent_id: null, identifier: 'PARENT' },
        { id: child2Id, parent_id: parentId, identifier: 'REQ-20' },
        { id: child1Id, parent_id: parentId, identifier: 'REQ-1' },
        { id: child3Id, parent_id: parentId, identifier: 'REQ-10' },
      ];

      const sorted = topologicalSort(requirements);

      expect(sorted[0].id).toBe(parentId);
      expect(sorted[1].id).toBe(child1Id); // REQ-1
      expect(sorted[2].id).toBe(child3Id); // REQ-10
      expect(sorted[3].id).toBe(child2Id); // REQ-20
    });

    it('should handle orphan requirements with non-existent parents', () => {
      const id1 = uuidv4();
      const id2 = uuidv4();
      const fakeParentId = uuidv4();

      const requirements = [
        { id: id1, parent_id: null, identifier: 'REQ-1' },
        { id: id2, parent_id: fakeParentId, identifier: 'REQ-2' }, // parent doesn't exist
      ];

      const sorted = topologicalSort(requirements);

      expect(sorted).toHaveLength(2);
      expect(sorted[0].id).toBe(id1);
      expect(sorted[1].id).toBe(id2);
    });

    it('should handle empty array', () => {
      const sorted = topologicalSort([]);
      expect(sorted).toEqual([]);
    });

    it('should handle multi-level hierarchy', () => {
      const rootId = uuidv4();
      const parentId = uuidv4();
      const grandchildId = uuidv4();

      const requirements = [
        { id: grandchildId, parent_id: parentId, identifier: 'GC' },
        { id: rootId, parent_id: null, identifier: 'ROOT' },
        { id: parentId, parent_id: rootId, identifier: 'P' },
      ];

      const sorted = topologicalSort(requirements);

      expect(sorted[0].id).toBe(rootId);
      expect(sorted[1].id).toBe(parentId);
      expect(sorted[2].id).toBe(grandchildId);
    });

    it('should not have cycles', () => {
      const id1 = uuidv4();
      const id2 = uuidv4();

      const requirements = [
        { id: id1, parent_id: id2, identifier: 'REQ-1' },
        { id: id2, parent_id: id1, identifier: 'REQ-2' }, // would be cycle if processed
      ];

      // Should not throw, just process them as orphans
      const sorted = topologicalSort(requirements);
      expect(sorted).toHaveLength(2);
    });
  });

  describe('buildRequirementTree', () => {
    it('should build a flat tree from single root', () => {
      const id = uuidv4();
      const requirements = [
        {
          id,
          identifier: 'REQ-1',
          name: 'Root Requirement',
          parent_id: null,
          description: 'A root req',
          open_cre: null,
          standard_id: uuidv4(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe(id);
      expect(tree[0].identifier).toBe('REQ-1');
      expect(tree[0].children).toEqual([]);
    });

    it('should build nested tree with children', () => {
      const parentId = uuidv4();
      const childId = uuidv4();
      const standardId = uuidv4();

      const requirements = [
        {
          id: parentId,
          identifier: 'PARENT',
          name: 'Parent',
          parent_id: null,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: childId,
          identifier: 'CHILD',
          name: 'Child',
          parent_id: parentId,
          description: 'Child description',
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe(parentId);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe(childId);
      expect(tree[0].children[0].name).toBe('Child');
    });

    it('should sort sibling children alphabetically', () => {
      const parentId = uuidv4();
      const child1Id = uuidv4();
      const child2Id = uuidv4();
      const child3Id = uuidv4();
      const standardId = uuidv4();

      const requirements = [
        {
          id: parentId,
          identifier: 'PARENT',
          name: 'Parent',
          parent_id: null,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: child2Id,
          identifier: 'REQ-20',
          name: 'Child 20',
          parent_id: parentId,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: child1Id,
          identifier: 'REQ-1',
          name: 'Child 1',
          parent_id: parentId,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: child3Id,
          identifier: 'REQ-10',
          name: 'Child 10',
          parent_id: parentId,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      expect(tree[0].children[0].identifier).toBe('REQ-1');
      expect(tree[0].children[1].identifier).toBe('REQ-10');
      expect(tree[0].children[2].identifier).toBe('REQ-20');
    });

    it('should handle multi-level nesting', () => {
      const rootId = uuidv4();
      const parentId = uuidv4();
      const grandchildId = uuidv4();
      const standardId = uuidv4();

      const requirements = [
        {
          id: rootId,
          identifier: 'ROOT',
          name: 'Root',
          parent_id: null,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: parentId,
          identifier: 'PARENT',
          name: 'Parent',
          parent_id: rootId,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: grandchildId,
          identifier: 'GRANDCHILD',
          name: 'Grandchild',
          parent_id: parentId,
          description: null,
          open_cre: null,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      expect(tree[0].id).toBe(rootId);
      expect(tree[0].children[0].id).toBe(parentId);
      expect(tree[0].children[0].children[0].id).toBe(grandchildId);
    });

    it('should handle empty array', () => {
      const tree = buildRequirementTree([]);
      expect(tree).toEqual([]);
    });

    it('should include all required fields in tree nodes', () => {
      const id = uuidv4();
      const standardId = uuidv4();
      const requirements = [
        {
          id,
          identifier: 'REQ-1',
          name: 'Test Requirement',
          parent_id: null,
          description: 'Test description',
          open_cre: 'CRE:123',
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      const node = tree[0];
      expect(node.id).toBe(id);
      expect(node.identifier).toBe('REQ-1');
      expect(node.name).toBe('Test Requirement');
      expect(node.parent_id).toBeNull();
      expect(node.description).toBe('Test description');
      expect(node.open_cre).toBe('CRE:123');
      expect(node.children).toEqual([]);
    });

    it('should handle null and undefined fields correctly', () => {
      const id = uuidv4();
      const standardId = uuidv4();
      const requirements = [
        {
          id,
          identifier: 'REQ-1',
          name: 'Test',
          parent_id: undefined,
          description: undefined,
          open_cre: undefined,
          standard_id: standardId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const tree = buildRequirementTree(requirements);

      const node = tree[0];
      expect(node.parent_id).toBeNull();
      expect(node.description).toBeNull();
      expect(node.open_cre).toBeNull();
    });
  });
});
