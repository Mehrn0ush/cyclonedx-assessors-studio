/**
 * Unit tests for the InAppChannel notification delivery.
 *
 * Tests the in-app notification creation, title/message/link building,
 * and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { InAppChannel } from '../../events/in-app-channel.js';
import type { EventEnvelope } from '../../events/types.js';
import * as recipientsModule from '../../events/recipients.js';

describe('InAppChannel', () => {
  let channel: InAppChannel;
  let mockDb: Kysely<Database>;
  let mockResolveRecipients: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create a mock database with chainable methods
    mockDb = {
      insertInto: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({}),
        }),
      }),
    } as unknown as Kysely<Database>;

    // Mock resolveRecipients
    mockResolveRecipients = vi.spyOn(recipientsModule, 'resolveRecipients');

    channel = new InAppChannel(() => mockDb);
  });

  describe('handles()', () => {
    it('always returns true', () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      const result = channel.handles(envelope);
      expect(result).toBe(true);
    });
  });

  describe('buildTitle()', () => {
    it('returns "Evidence Submitted for Review" for evidence.state_changed with in_review', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'in_review' },
      };

      // We need to call deliverToUser to test buildTitle indirectly
      // Actually, buildTitle is private. We'll test it through deliverToUser.
      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Evidence Submitted for Review');
    });

    it('returns "Evidence Approved" for evidence.state_changed with approved state', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'approved' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Evidence Approved');
    });

    it('returns "Evidence Approved" for evidence.state_changed with claimed state', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'claimed' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Evidence Approved');
    });

    it('returns "Evidence Rejected" for evidence.state_changed with in_progress state', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'in_progress' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Evidence Rejected');
    });

    it('returns "Assessment Started" for assessment.state_changed with in_progress', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.state_changed',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'in_progress' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Assessment Started');
    });

    it('returns "Assessment Completed" for assessment.state_changed with completed', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.state_changed',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'completed' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Assessment Completed');
    });

    it('returns "New Assessment Created" for assessment.created', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.created',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('New Assessment Created');
    });

    it('returns "Attestation Created" for attestation.created', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'attestation.created',
        category: 'attestation',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Attestation Created');
    });

    it('returns "Attestation Signed" for attestation.signed', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'attestation.signed',
        category: 'attestation',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Attestation Signed');
    });

    it('returns formatted default title for unknown event types', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'custom.event.happened',
        category: 'custom',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.title).toBe('Custom Event Happened');
    });
  });

  describe('buildMessage()', () => {
    it('returns correct message for evidence submitted for review', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'in_review', evidenceName: 'Security Checklist' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe('Evidence "Security Checklist" has been submitted for your review');
    });

    it('returns correct message for evidence approved', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'approved', evidenceName: 'Security Checklist' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe('Your evidence "Security Checklist" has been approved');
    });

    it('returns correct message for evidence rejected without reason', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'in_progress', evidenceName: 'Security Checklist' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe('Your evidence "Security Checklist" has been rejected');
    });

    it('returns correct message for evidence rejected with reason', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {
          newState: 'in_progress',
          evidenceName: 'Security Checklist',
          rejectionReason: 'Incomplete documentation',
        },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe(
        'Your evidence "Security Checklist" has been rejected. Reason: Incomplete documentation',
      );
    });

    it('returns correct message for assessment state changes', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.state_changed',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { newState: 'completed', assessmentTitle: 'Q1 Security Assessment' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe('Assessment "Q1 Security Assessment" has been completed');
    });

    it('returns correct message for assessment.created', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.created',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { assessmentTitle: 'Q1 Security Assessment' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.message).toBe('Assessment "Q1 Security Assessment" has been created');
    });
  });

  describe('buildLink()', () => {
    it('returns /evidence/{id} for evidence events', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { evidenceId: 'ev-123' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.link).toBe('/evidence/ev-123');
    });

    it('returns /assessments/{id} for assessment events', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'assessment.state_changed',
        category: 'assessment',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { assessmentId: 'ass-456' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.link).toBe('/assessments/ass-456');
    });

    it('returns /attestations/{id} for attestation events', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'attestation.created',
        category: 'attestation',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { attestationId: 'att-789' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.link).toBe('/attestations/att-789');
    });

    it('returns /projects/{id} for project events', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'project.created',
        category: 'project',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { projectId: 'proj-111' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.link).toBe('/projects/proj-111');
    });

    it('returns undefined for events without matching ID field', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'unknown.event',
        category: 'unknown',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);
      const values = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(values.link).toBeUndefined();
    });
  });

  describe('process()', () => {
    it('calls deliverToUser for each recipient', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { evidenceId: 'ev-123', evidenceName: 'Test Evidence' },
      };

      const recipients = ['user-2', 'user-3', 'user-4'];
      mockResolveRecipients.mockResolvedValue(recipients);

      await channel.process(envelope);

      // Should have been called once for each recipient
      expect((mockDb.insertInto as any).mock.calls.length).toBe(3);
    });

    it('does nothing when no recipients found', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'unknown.event',
        category: 'unknown',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: {},
      };

      mockResolveRecipients.mockResolvedValue([]);

      await channel.process(envelope);

      // Should not have called insertInto at all
      expect((mockDb.insertInto as any).mock.calls.length).toBe(0);
    });
  });

  describe('deliverToUser()', () => {
    it('inserts notification record into DB', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { evidenceId: 'ev-123', evidenceName: 'Test Evidence' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);

      const insertCall = (mockDb.insertInto as any).mock.calls[0][0];
      expect(insertCall).toBe('notification');

      const valuesArg = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg).toHaveProperty('id');
      expect(valuesArg.user_id).toBe('user-2');
      expect(valuesArg).toHaveProperty('title');
      expect(valuesArg).toHaveProperty('message');
      expect(valuesArg.is_read).toBe(false);
    });

    it('converts dots in event type to underscores for DB type field', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { evidenceId: 'ev-123', evidenceName: 'Test Evidence' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      await channel.process(envelope);

      const valuesArg = (mockDb.insertInto as any).mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.type).toBe('evidence_state_changed');
    });

    it('handles DB errors gracefully', async () => {
      const envelope: EventEnvelope = {
        id: 'evt_test',
        type: 'evidence.state_changed',
        category: 'evidence',
        timestamp: new Date().toISOString(),
        version: '1',
        actor: { userId: 'user-1', displayName: 'John Doe' },
        data: { evidenceId: 'ev-123' },
      };

      mockResolveRecipients.mockResolvedValue(['user-2']);

      // Mock DB error
      (mockDb.insertInto as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          execute: vi.fn().mockRejectedValue(new Error('DB constraint violation')),
        }),
      });

      // Should not throw
      await expect(channel.process(envelope)).resolves.not.toThrow();
    });
  });

  describe('initialize() and shutdown()', () => {
    it('initializes without error', async () => {
      await expect(channel.initialize()).resolves.not.toThrow();
    });

    it('shuts down without error', async () => {
      await expect(channel.shutdown()).resolves.not.toThrow();
    });

    it('has correct name property', () => {
      expect(channel.name).toBe('in_app');
    });
  });
});
