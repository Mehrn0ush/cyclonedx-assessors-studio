/**
 * Unit tests for audit logging utilities.
 *
 * Tests the logAudit function with various entity types and actions,
 * verifying that audit entries are properly inserted into the database
 * and that errors are gracefully handled.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logAudit } from '../../utils/audit.js';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestUser } from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Audit Logging', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe('logAudit', () => {
    it('should log an audit entry with basic parameters', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'create',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry).toBeDefined();
      expect(entry?.entity_type).toBe('project');
      expect(entry?.action).toBe('create');
      expect(entry?.user_id).toBe(user.id);
      expect(entry?.changes).toBeNull();
      expect(entry?.created_at).toBeInstanceOf(Date);
    });

    it('should log an audit entry with changes', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();
      const changes = {
        field1: { old: 'value1', new: 'newvalue1' },
        field2: { old: 100, new: 200 },
      };

      await logAudit(db, {
        entityType: 'assessment',
        entityId,
        action: 'update',
        userId: user.id,
        changes,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry).toBeDefined();
      expect(entry?.changes).toEqual(changes);
    });

    it('should support create action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'evidence',
        entityId,
        action: 'create',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('create');
    });

    it('should support create_for_other action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'user',
        entityId,
        action: 'create_for_other',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('create_for_other');
    });

    it('should support update action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'update',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('update');
    });

    it('should support delete action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'assessment',
        entityId,
        action: 'delete',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('delete');
    });

    it('should support state_change action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'evidence',
        entityId,
        action: 'state_change',
        userId: user.id,
        changes: { state: { old: 'draft', new: 'approved' } },
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('state_change');
      expect(entry?.changes).toBeDefined();
    });

    it('should support link action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'claim',
        entityId,
        action: 'link',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('link');
    });

    it('should support unlink action', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'evidence',
        entityId,
        action: 'unlink',
        userId: user.id,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.action).toBe('unlink');
    });

    it('should log different entity types', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityTypes = ['project', 'assessment', 'evidence', 'claim', 'attestation', 'user', 'standard'];

      for (const entityType of entityTypes) {
        const entityId = uuidv4();
        await logAudit(db, {
          entityType,
          entityId,
          action: 'create',
          userId: user.id,
        });
      }

      const entries = await db
        .selectFrom('audit_log')
        .select('entity_type')
        .distinct()
        .execute();

      const storedTypes = entries.map((e) => e.entity_type);
      for (const entityType of entityTypes) {
        expect(storedTypes).toContain(entityType);
      }
    });

    it('should include timestamp on created audit entries', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();
      const beforeTime = new Date();

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'create',
        userId: user.id,
      });

      const afterTime = new Date();

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.created_at).toBeDefined();
      expect(entry?.created_at!.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(entry?.created_at!.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should store complex changes objects', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();
      const changes = {
        name: { old: 'Old Name', new: 'New Name' },
        description: { old: null, new: 'A description' },
        metadata: {
          old: { key1: 'value1' },
          new: { key1: 'value1', key2: 'value2' },
        },
        tags: { old: ['tag1'], new: ['tag1', 'tag2', 'tag3'] },
      };

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'update',
        userId: user.id,
        changes,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.changes).toEqual(changes);
    });

    it('should handle null changes gracefully', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'assessment',
        entityId,
        action: 'delete',
        userId: user.id,
        changes: undefined,
      });

      const entry = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .selectAll()
        .executeTakeFirst();

      expect(entry?.changes).toBeNull();
    });

    it('should generate unique IDs for each audit entry', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId1 = uuidv4();
      const entityId2 = uuidv4();

      await logAudit(db, {
        entityType: 'project',
        entityId: entityId1,
        action: 'create',
        userId: user.id,
      });

      await logAudit(db, {
        entityType: 'assessment',
        entityId: entityId2,
        action: 'create',
        userId: user.id,
      });

      const entries = await db
        .selectFrom('audit_log')
        .select('id')
        .where('entity_id', 'in', [entityId1, entityId2])
        .execute();

      const ids = entries.map((e) => e.id);
      expect(ids.length).toBe(2);
      expect(new Set(ids).size).toBe(2); // All unique
    });

    it('should allow multiple audits for the same entity with different actions', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'create',
        userId: user.id,
      });

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'update',
        userId: user.id,
      });

      await logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'state_change',
        userId: user.id,
      });

      const entries = await db
        .selectFrom('audit_log')
        .where('entity_id', '=', entityId)
        .select('action')
        .execute();

      expect(entries.length).toBe(3);
      expect(entries.map((e) => e.action)).toEqual(['create', 'update', 'state_change']);
    });

    it('should handle errors gracefully and not throw', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const entityId = uuidv4();

      // Call with invalid user ID should not throw
      const promise = logAudit(db, {
        entityType: 'project',
        entityId,
        action: 'create',
        userId: 'invalid-user-id-that-does-not-exist',
      });

      // Should not throw
      await expect(promise).resolves.not.toThrow();
    });
  });
});
