import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestUser,
  createTestEvidence,
  createTestTag,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Evidence', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Evidence CRUD operations', () => {
    it('should create evidence record', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id, {
        name: 'Security Test Results',
        description: 'Penetration test findings',
      });

      const result = await db.selectFrom('evidence')
        .where('id', '=', evidence.id)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      expect(result!.name).toBe('Security Test Results');
      expect(result!.description).toBe('Penetration test findings');
      expect(result!.author_id).toBe(author.id);
    });

    it('should create evidence with all fields', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const reviewerId = (await createTestUser()).id;
      const evidenceId = uuidv4();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      await db.insertInto('evidence').values({
        id: evidenceId,
        name: 'Full Evidence',
        description: 'Complete evidence record',
        bom_ref: 'evidence-123',
        property_name: 'security_score',
        state: 'in_progress',
        author_id: author.id,
        reviewer_id: reviewerId,
        expires_on: expiryDate,
        is_counter_evidence: false,
        classification: 'confidential',
      }).execute();

      const result = await db.selectFrom('evidence')
        .where('id', '=', evidenceId)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      expect(result!.bom_ref).toBe('evidence-123');
      expect(result!.property_name).toBe('security_score');
      expect(result!.classification).toBe('confidential');
      expect(result!.is_counter_evidence).toBe(false);
    });

    it('should support evidence state transitions', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id, { state: 'in_progress' });

      const states = ['in_progress', 'in_review', 'claimed', 'expired'];

      for (const state of states) {
        await db.updateTable('evidence')
          .set({ state: state as any })
          .where('id', '=', evidence.id)
          .execute();

        const updated = await db.selectFrom('evidence')
          .where('id', '=', evidence.id)
          .selectAll()
          .executeTakeFirst();

        expect(updated!.state).toBe(state);
      }
    });

    it('should create evidence notes', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const reviewer = await createTestUser();
      const evidence = await createTestEvidence(author.id);

      const noteId = uuidv4();
      await db.insertInto('evidence_note').values({
        id: noteId,
        evidence_id: evidence.id,
        user_id: reviewer.id,
        content: 'This evidence is satisfactory',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      const note = await db.selectFrom('evidence_note')
        .where('id', '=', noteId)
        .selectAll()
        .executeTakeFirst();

      expect(note).toBeDefined();
      expect(note!.content).toBe('This evidence is satisfactory');
      expect(note!.user_id).toBe(reviewer.id);
    });

    it('should retrieve evidence notes with user details', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const reviewer = await createTestUser({ displayName: 'Review Team' });
      const evidence = await createTestEvidence(author.id);

      await db.insertInto('evidence_note').values({
        id: uuidv4(),
        evidence_id: evidence.id,
        user_id: reviewer.id,
        content: 'Notes from reviewer',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      const result = await db.selectFrom('evidence_note')
        .innerJoin('app_user', 'app_user.id', 'evidence_note.user_id')
        .where('evidence_note.evidence_id', '=', evidence.id)
        .selectAll()
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Notes from reviewer');
    });

    it('should delete evidence notes when evidence is deleted', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);

      await db.insertInto('evidence_note').values({
        id: uuidv4(),
        evidence_id: evidence.id,
        user_id: author.id,
        content: 'Test note',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      await db.deleteFrom('evidence').where('id', '=', evidence.id).execute();

      const remainingNotes = await db.selectFrom('evidence_note')
        .where('evidence_id', '=', evidence.id)
        .selectAll()
        .execute();

      expect(remainingNotes).toHaveLength(0);
    });

    it('should associate tags with evidence', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const tag1 = await createTestTag({ name: 'validated' });
      const tag2 = await createTestTag({ name: 'critical' });

      await db.insertInto('evidence_tag').values({
        evidence_id: evidence.id,
        tag_id: tag1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('evidence_tag').values({
        evidence_id: evidence.id,
        tag_id: tag2.id,
        created_at: new Date(),
      }).execute();

      const tags = await db.selectFrom('evidence_tag')
        .where('evidence_id', '=', evidence.id)
        .selectAll()
        .execute();

      expect(tags).toHaveLength(2);
    });

    it('should retrieve evidence with tags', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const tag = await createTestTag({ name: 'approved', color: '#00FF00' });

      await db.insertInto('evidence_tag').values({
        evidence_id: evidence.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      const result = await db.selectFrom('evidence_tag')
        .innerJoin('tag', 'tag.id', 'evidence_tag.tag_id')
        .where('evidence_tag.evidence_id', '=', evidence.id)
        .selectAll()
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('approved');
      expect(result[0].color).toBe('#00FF00');
    });

    it('should support counter evidence flag', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidenceId = uuidv4();

      await db.insertInto('evidence').values({
        id: evidenceId,
        name: 'Counter Evidence',
        state: 'in_progress',
        author_id: author.id,
        is_counter_evidence: true,
      }).execute();

      const evidence = await db.selectFrom('evidence')
        .where('id', '=', evidenceId)
        .selectAll()
        .executeTakeFirst();

      expect(evidence!.is_counter_evidence).toBe(true);
    });

    it('should track evidence expiry', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const expiryDate = new Date('2025-12-31');
      const evidenceId = uuidv4();

      await db.insertInto('evidence').values({
        id: evidenceId,
        name: 'Expiring Evidence',
        state: 'in_progress',
        author_id: author.id,
        expires_on: expiryDate,
      }).execute();

      const evidence = await db.selectFrom('evidence')
        .where('id', '=', evidenceId)
        .selectAll()
        .executeTakeFirst();

      expect(evidence!.expires_on).toBeDefined();
    });

    it('should support evidence attachments', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const attachmentId = uuidv4();

      await db.insertInto('evidence_attachment').values({
        id: attachmentId,
        evidence_id: evidence.id,
        filename: 'security_report.pdf',
        content_type: 'application/pdf',
        size_bytes: 102400,
        storage_path: '/storage/attachments/security_report.pdf',
        storage_provider: 'database',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      const attachment = await db.selectFrom('evidence_attachment')
        .where('id', '=', attachmentId)
        .selectAll()
        .executeTakeFirst();

      expect(attachment).toBeDefined();
      expect(attachment!.filename).toBe('security_report.pdf');
      expect(attachment!.size_bytes).toBe(102400);
    });

    it('should delete attachments when evidence is deleted', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);

      await db.insertInto('evidence_attachment').values({
        id: uuidv4(),
        evidence_id: evidence.id,
        filename: 'test.pdf',
        content_type: 'application/pdf',
        size_bytes: 1024,
        storage_path: '/storage/test.pdf',
        storage_provider: 'database',
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      await db.deleteFrom('evidence').where('id', '=', evidence.id).execute();

      const remainingAttachments = await db.selectFrom('evidence_attachment')
        .where('evidence_id', '=', evidence.id)
        .selectAll()
        .execute();

      expect(remainingAttachments).toHaveLength(0);
    });

    it('should list evidence by state', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();

      await createTestEvidence(author.id, { state: 'in_progress' });
      await createTestEvidence(author.id, { state: 'in_review' });
      await createTestEvidence(author.id, { state: 'claimed' });

      const inProgress = await db.selectFrom('evidence')
        .where('state', '=', 'in_progress')
        .selectAll()
        .execute();

      const inReview = await db.selectFrom('evidence')
        .where('state', '=', 'in_review')
        .selectAll()
        .execute();

      expect(inProgress.length).toBeGreaterThanOrEqual(1);
      expect(inReview.length).toBeGreaterThanOrEqual(1);
    });
  });
});
