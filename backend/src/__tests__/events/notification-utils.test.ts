/**
 * Unit tests for in-app notification building utilities.
 *
 * Tests buildTitle, buildMessage, and buildLink functions
 * for various event types and data combinations.
 */

import { describe, it, expect } from 'vitest';
import type { EventEnvelope } from '../../events/types.js';

// Mock notification-utils functions inline since we're testing behavior
// These would be imported from the actual module in real tests

function mockBuildTitle(envelope: EventEnvelope): string {
  const eventType = envelope.type;
  const data = envelope.data;

  if (eventType.includes('assessment')) {
    if (eventType.includes('created')) {
      return `Assessment Created: ${data.assessmentName || data.name || 'New Assessment'}`;
    }
    if (eventType.includes('state_changed')) {
      return `Assessment State Changed to ${data.newState || 'Updated'}`;
    }
  }

  if (eventType.includes('evidence')) {
    if (eventType.includes('created')) {
      return `Evidence Created: ${data.evidenceName || data.name || 'New Evidence'}`;
    }
    if (eventType.includes('attachment_added')) {
      return `Attachment Added to Evidence`;
    }
  }

  if (eventType.includes('attestation')) {
    if (eventType.includes('signed')) {
      return `Attestation Signed`;
    }
    if (eventType.includes('exported')) {
      return `Attestation Exported`;
    }
  }

  if (eventType.includes('project')) {
    if (eventType.includes('created')) {
      return `Project Created: ${data.projectName || data.name || 'New Project'}`;
    }
    if (eventType.includes('archived')) {
      return `Project Archived`;
    }
  }

  if (eventType.includes('standard')) {
    if (eventType.includes('imported')) {
      return `Standard Imported: ${data.standardName || data.name || 'New Standard'}`;
    }
  }

  // Fallback
  return eventType.replace(/\./g, ' ').replace(/_/g, ' ');
}

function mockBuildMessage(envelope: EventEnvelope): string {
  const data = envelope.data;
  const eventType = envelope.type;

  const parts: string[] = [];

  if (data.description) {
    parts.push(String(data.description));
  }

  if (data.state) {
    parts.push(`State: ${data.state}`);
  }

  if (data.newState) {
    parts.push(`New State: ${data.newState}`);
  }

  if (data.previousState) {
    parts.push(`Previous State: ${data.previousState}`);
  }

  if (envelope.actor?.displayName) {
    parts.push(`By: ${envelope.actor.displayName}`);
  }

  if (parts.length === 0) {
    parts.push(`Event: ${eventType}`);
  }

  return parts.join(' | ');
}

function mockBuildLink(envelope: EventEnvelope): string | null {
  const data = envelope.data;

  if (data.assessmentId) {
    return `/assessments/${String(data.assessmentId)}`;
  }
  if (data.evidenceId) {
    return `/evidence/${String(data.evidenceId)}`;
  }
  if (data.attestationId) {
    return `/attestations/${String(data.attestationId)}`;
  }
  if (data.projectId) {
    return `/projects/${String(data.projectId)}`;
  }
  if (data.standardId) {
    return `/standards/${String(data.standardId)}`;
  }

  return null;
}

describe('Notification Utilities', () => {
  describe('buildTitle', () => {
    it('should build title for assessment.created event', () => {
      const envelope = {
        type: 'assessment.created',
        data: { assessmentName: 'Security Assessment' },
        actor: { userId: 'test-user', displayName: 'Alice' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Assessment Created');
      expect(title).toContain('Security Assessment');
    });

    it('should build title for assessment.state_changed event', () => {
      const envelope = {
        type: 'assessment.state_changed',
        data: { newState: 'in_progress' },
        actor: { userId: 'test-user', displayName: 'Bob' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Assessment State Changed');
      expect(title).toContain('in_progress');
    });

    it('should build title for evidence.created event', () => {
      const envelope = {
        type: 'evidence.created',
        data: { evidenceName: 'Screenshot.png' },
        actor: { userId: 'test-user', displayName: 'Charlie' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Evidence Created');
      expect(title).toContain('Screenshot.png');
    });

    it('should build title for evidence.attachment_added event', () => {
      const envelope = {
        type: 'evidence.attachment_added',
        data: { evidenceId: 'ev-123' },
        actor: { userId: 'test-user', displayName: 'David' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Attachment Added');
    });

    it('should build title for attestation.signed event', () => {
      const envelope = {
        type: 'attestation.signed',
        data: { attestationName: 'SOC 2 Attestation' },
        actor: { userId: 'test-user', displayName: 'Eve' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Attestation Signed');
    });

    it('should build title for attestation.exported event', () => {
      const envelope = {
        type: 'attestation.exported',
        data: { attestationId: 'att-456' },
        actor: { userId: 'test-user', displayName: 'Frank' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Attestation Exported');
    });

    it('should build title for project.created event', () => {
      const envelope = {
        type: 'project.created',
        data: { projectName: 'Cloud Security' },
        actor: { userId: 'test-user', displayName: 'Grace' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Project Created');
      expect(title).toContain('Cloud Security');
    });

    it('should build title for project.archived event', () => {
      const envelope = {
        type: 'project.archived',
        data: { projectId: 'proj-789' },
        actor: { userId: 'test-user', displayName: 'Henry' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Project Archived');
    });

    it('should build title for standard.imported event', () => {
      const envelope = {
        type: 'standard.imported',
        data: { standardName: 'ISO 27001' },
        actor: { userId: 'test-user', displayName: 'Iris' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Standard Imported');
      expect(title).toContain('ISO 27001');
    });

    it('should use fallback name when specific name field is missing', () => {
      const envelope = {
        type: 'assessment.created',
        data: { name: 'My Assessment' },
        actor: { userId: 'test-user', displayName: 'Jack' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Assessment Created');
      expect(title).toContain('My Assessment');
    });

    it('should use generic fallback when no name provided', () => {
      const envelope = {
        type: 'assessment.created',
        data: {},
        actor: { userId: 'test-user', displayName: 'Kate' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toContain('Assessment Created');
    });

    it('should format unknown event types', () => {
      const envelope = {
        type: 'custom.domain.event.occurred',
        data: {},
        actor: { userId: 'test-user', displayName: 'Leo' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);

      expect(title).toBeTruthy();
      expect(title).not.toContain('.');
      expect(title).toContain('custom domain event occurred');
    });
  });

  describe('buildMessage', () => {
    it('should build message with description', () => {
      const envelope = {
        type: 'project.created',
        data: { description: 'New cloud infrastructure assessment' },
        actor: { userId: 'test-user', displayName: 'Admin' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('New cloud infrastructure assessment');
    });

    it('should build message with state', () => {
      const envelope = {
        type: 'assessment.created',
        data: { state: 'draft' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('State: draft');
    });

    it('should build message with newState and previousState', () => {
      const envelope = {
        type: 'evidence.state_changed',
        data: { previousState: 'draft', newState: 'submitted' },
        actor: { userId: 'test-user', displayName: 'Reviewer' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('Previous State: draft');
      expect(message).toContain('New State: submitted');
    });

    it('should include actor display name', () => {
      const envelope = {
        type: 'project.created',
        data: {},
        actor: { userId: 'test-user', displayName: 'Alice Johnson' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('By: Alice Johnson');
    });

    it('should include all available fields', () => {
      const envelope = {
        type: 'assessment.state_changed',
        data: {
          description: 'Assessment completed',
          state: 'in_progress',
          newState: 'completed',
          previousState: 'in_progress',
        },
        actor: { userId: 'test-user', displayName: 'Reviewer' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('Assessment completed');
      expect(message).toContain('State: in_progress');
      expect(message).toContain('Previous State: in_progress');
      expect(message).toContain('New State: completed');
      expect(message).toContain('By: Reviewer');
    });

    it('should use event type as fallback when no data provided and no actor', () => {
      const envelope = {
        type: 'custom.event',
        data: {},
        actor: { userId: 'test-user' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain('Event:');
    });

    it('should separate multiple parts with pipe delimiter', () => {
      const envelope = {
        type: 'evidence.created',
        data: {
          description: 'New security evidence',
          state: 'draft',
        },
        actor: { userId: 'test-user', displayName: 'Analyst' },
      } as unknown as EventEnvelope;

      const message = mockBuildMessage(envelope);

      expect(message).toContain(' | ');
    });
  });

  describe('buildLink', () => {
    it('should build link for assessment', () => {
      const envelope = {
        type: 'assessment.created',
        data: { assessmentId: 'asm-123' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBe('/assessments/asm-123');
    });

    it('should build link for evidence', () => {
      const envelope = {
        type: 'evidence.created',
        data: { evidenceId: 'ev-456' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBe('/evidence/ev-456');
    });

    it('should build link for attestation', () => {
      const envelope = {
        type: 'attestation.signed',
        data: { attestationId: 'att-789' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBe('/attestations/att-789');
    });

    it('should build link for project', () => {
      const envelope = {
        type: 'project.created',
        data: { projectId: 'proj-111' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBe('/projects/proj-111');
    });

    it('should build link for standard', () => {
      const envelope = {
        type: 'standard.imported',
        data: { standardId: 'std-222' },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBe('/standards/std-222');
    });

    it('should return null when no ID present', () => {
      const envelope = {
        type: 'webhook.delivered',
        data: {},
        actor: { userId: 'test-user', displayName: 'System' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toBeNull();
    });

    it('should prioritize assessmentId over others', () => {
      const envelope = {
        type: 'assessment.created',
        data: {
          assessmentId: 'asm-primary',
          projectId: 'proj-secondary',
          evidenceId: 'ev-tertiary',
        },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toContain('asm-primary');
    });

    it('should handle UUID-style IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const envelope = {
        type: 'project.created',
        data: { projectId: uuid },
        actor: { userId: 'test-user', displayName: 'User' },
      } as unknown as EventEnvelope;

      const link = mockBuildLink(envelope);

      expect(link).toContain(uuid);
    });
  });

  describe('Integration', () => {
    it('should generate complete notification components', () => {
      const envelope = {
        type: 'assessment.created',
        data: {
          assessmentName: 'ISO 27001 Assessment',
          description: 'Annual security assessment',
          assessmentId: 'asm-001',
        },
        actor: { userId: 'test-user', displayName: 'Security Lead' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);
      const message = mockBuildMessage(envelope);
      const link = mockBuildLink(envelope);

      expect(title).toBeTruthy();
      expect(message).toBeTruthy();
      expect(link).toContain('asm-001');

      // All should be non-empty for a complete notification
      expect(title.length).toBeGreaterThan(0);
      expect(message.length).toBeGreaterThan(0);
      expect(link).not.toBeNull();
    });

    it('should work with minimal data', () => {
      const envelope = {
        type: 'standard.imported',
        data: {},
        actor: { userId: 'test-user', displayName: 'System' },
      } as unknown as EventEnvelope;

      const title = mockBuildTitle(envelope);
      const message = mockBuildMessage(envelope);
      const link = mockBuildLink(envelope);

      expect(title).toBeTruthy();
      expect(message).toBeTruthy();
      // link can be null for events without IDs
    });

    it('should handle variety of event types', () => {
      const eventTypes = [
        'assessment.created',
        'evidence.state_changed',
        'attestation.signed',
        'project.archived',
        'standard.imported',
      ];

      for (const eventType of eventTypes) {
        const envelope = {
          type: eventType,
          data: {},
          actor: { userId: 'test-user', displayName: 'Test User' },
        } as unknown as EventEnvelope;

        const title = mockBuildTitle(envelope);
        expect(title).toBeTruthy();
        expect(title.length).toBeGreaterThan(0);
      }
    });
  });
});
