/**
 * Unit tests for chat message formatters.
 */

import { describe, it, expect } from 'vitest';
import {
  formatSlackMessage,
  formatTeamsMessage,
  formatMattermostMessage,
  getEventNature,
  getSummary,
  buildActionUrl,
  buildEventFields,
} from '../../events/channels/chat-formatters.js';
import type { EventEnvelope } from '../../events/types.js';

const APP_URL = 'https://studio.example.com';

function makeEnvelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: 'evt_test-1234',
    type: 'evidence.state_changed',
    category: 'evidence',
    timestamp: '2026-04-08T12:00:00Z',
    version: '1',
    actor: { userId: 'user-1', displayName: 'Jane Smith' },
    data: {
      evidenceId: 'ev-123',
      name: 'Q3 Penetration Test Report',
      state: 'approved',
      projectName: 'Product Security Assessment',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getEventNature
// ---------------------------------------------------------------------------

describe('getEventNature', () => {
  it('should classify created events', () => {
    expect(getEventNature('assessment.created')).toBe('created');
    expect(getEventNature('evidence.created')).toBe('created');
    expect(getEventNature('standard.imported')).toBe('created');
  });

  it('should classify approved/success events', () => {
    expect(getEventNature('attestation.signed')).toBe('approved');
    expect(getEventNature('attestation.exported')).toBe('approved');
  });

  it('should classify rejection/failure events', () => {
    expect(getEventNature('assessment.deleted')).toBe('rejected');
    expect(getEventNature('channel.webhook.disabled')).toBe('rejected');
  });

  it('should default to stateChange', () => {
    expect(getEventNature('assessment.state_changed')).toBe('stateChange');
    expect(getEventNature('evidence.state_changed')).toBe('stateChange');
  });
});

// ---------------------------------------------------------------------------
// getSummary
// ---------------------------------------------------------------------------

describe('getSummary', () => {
  it('should produce assessment summaries', () => {
    expect(getSummary('assessment.created', { name: 'My Assessment' })).toBe('Assessment Created: My Assessment');
    expect(getSummary('assessment.state_changed', { state: 'in_progress' })).toBe('Assessment in_progress');
    expect(getSummary('assessment.assigned', { title: 'Sprint Review' })).toBe('Assessment Assigned: Sprint Review');
  });

  it('should produce evidence summaries', () => {
    expect(getSummary('evidence.created', { name: 'Pen Test' })).toBe('Evidence Created: Pen Test');
    expect(getSummary('evidence.state_changed', { newState: 'approved' })).toBe('Evidence approved');
  });

  it('should produce attestation summaries', () => {
    expect(getSummary('attestation.created', {})).toBe('Attestation Created: New Attestation');
    expect(getSummary('attestation.signed', { name: 'Q4 Attestation' })).toBe('Attestation Signed: Q4 Attestation');
  });

  it('should produce claim summaries', () => {
    expect(getSummary('claim.created', { name: 'Claim A' })).toBe('Claim Created: Claim A');
    expect(getSummary('claim.updated', { name: 'Claim B' })).toBe('Claim Updated: Claim B');
  });

  it('should produce project summaries', () => {
    expect(getSummary('project.created', { name: 'Alpha' })).toBe('Project Created: Alpha');
    expect(getSummary('project.archived', {})).toBe('Project Archived: Project');
  });

  it('should produce standard summaries', () => {
    expect(getSummary('standard.imported', { name: 'ASVS' })).toBe('Standard Imported: ASVS');
  });

  it('should fallback for unknown types', () => {
    expect(getSummary('unknown.event', {})).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildActionUrl
// ---------------------------------------------------------------------------

describe('buildActionUrl', () => {
  it('should build evidence URL', () => {
    const url = buildActionUrl(APP_URL, makeEnvelope());
    expect(url).toBe('https://studio.example.com/evidence/ev-123');
  });

  it('should build assessment URL', () => {
    const url = buildActionUrl(APP_URL, makeEnvelope({
      data: { assessmentId: 'asmnt-1' },
    }));
    expect(url).toBe('https://studio.example.com/assessments/asmnt-1');
  });

  it('should build project URL', () => {
    const url = buildActionUrl(APP_URL, makeEnvelope({
      data: { projectId: 'proj-1' },
    }));
    expect(url).toBe('https://studio.example.com/projects/proj-1');
  });

  it('should return null when no ID is present', () => {
    const url = buildActionUrl(APP_URL, makeEnvelope({ data: {} }));
    expect(url).toBeNull();
  });

  it('should strip trailing slash from app URL', () => {
    const url = buildActionUrl('https://studio.example.com/', makeEnvelope());
    expect(url).toBe('https://studio.example.com/evidence/ev-123');
  });
});

// ---------------------------------------------------------------------------
// buildEventFields
// ---------------------------------------------------------------------------

describe('buildEventFields', () => {
  it('should extract known fields from data', () => {
    const fields = buildEventFields({
      name: 'Test',
      state: 'approved',
      projectName: 'Proj',
    });
    expect(fields).toHaveLength(3);
    expect(fields[0]).toEqual({ title: 'Name', value: 'Test' });
    expect(fields[1]).toEqual({ title: 'State', value: 'approved' });
    expect(fields[2]).toEqual({ title: 'Project', value: 'Proj' });
  });

  it('should skip null/undefined/empty values', () => {
    const fields = buildEventFields({ name: 'Test', description: '', state: null, role: undefined });
    expect(fields).toHaveLength(1);
    expect(fields[0].title).toBe('Name');
  });
});

// ---------------------------------------------------------------------------
// Slack Block Kit formatter
// ---------------------------------------------------------------------------

describe('formatSlackMessage', () => {
  it('should return a blocks array', () => {
    const msg = formatSlackMessage(makeEnvelope(), APP_URL);
    expect(msg).toHaveProperty('blocks');
    expect(Array.isArray(msg.blocks)).toBe(true);
  });

  it('should include a header block with summary', () => {
    const msg = formatSlackMessage(makeEnvelope({ type: 'evidence.created', data: { name: 'Report', evidenceId: 'e1' } }), APP_URL);
    const blocks = msg.blocks as any[];
    const header = blocks.find((b: any) => b.type === 'header');
    expect(header).toBeDefined();
    expect(header.text.text).toContain('Evidence Created');
  });

  it('should include actor information', () => {
    const msg = formatSlackMessage(makeEnvelope(), APP_URL);
    const blocks = msg.blocks as any[];
    const actorBlock = blocks.find(
      (b: any) => b.type === 'section' && b.text?.text?.includes('Jane Smith'),
    );
    expect(actorBlock).toBeDefined();
  });

  it('should include an action button with URL', () => {
    const msg = formatSlackMessage(makeEnvelope(), APP_URL);
    const blocks = msg.blocks as any[];
    const actions = blocks.find((b: any) => b.type === 'actions');
    expect(actions).toBeDefined();
    expect(actions.elements[0].url).toBe('https://studio.example.com/evidence/ev-123');
  });

  it('should include a divider', () => {
    const msg = formatSlackMessage(makeEnvelope(), APP_URL);
    const blocks = msg.blocks as any[];
    expect(blocks[blocks.length - 1].type).toBe('divider');
  });
});

// ---------------------------------------------------------------------------
// Teams Adaptive Card formatter
// ---------------------------------------------------------------------------

describe('formatTeamsMessage', () => {
  it('should return a message with attachments', () => {
    const msg = formatTeamsMessage(makeEnvelope(), APP_URL);
    expect(msg.type).toBe('message');
    expect(msg).toHaveProperty('attachments');
    const attachments = msg.attachments as any[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
  });

  it('should include AdaptiveCard schema and version', () => {
    const msg = formatTeamsMessage(makeEnvelope(), APP_URL);
    const card = (msg.attachments as any[])[0].content;
    expect(card.$schema).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.4');
  });

  it('should include a TextBlock header', () => {
    const msg = formatTeamsMessage(makeEnvelope({ type: 'assessment.created', data: { name: 'Sprint', assessmentId: 'a1' } }), APP_URL);
    const card = (msg.attachments as any[])[0].content;
    const header = card.body[0];
    expect(header.type).toBe('TextBlock');
    expect(header.text).toContain('Assessment Created');
  });

  it('should include FactSet with actor', () => {
    const msg = formatTeamsMessage(makeEnvelope(), APP_URL);
    const card = (msg.attachments as any[])[0].content;
    const factSet = card.body.find((b: any) => b.type === 'FactSet');
    expect(factSet).toBeDefined();
    const byFact = factSet.facts.find((f: any) => f.title === 'By');
    expect(byFact?.value).toBe('Jane Smith');
  });

  it('should include action URL', () => {
    const msg = formatTeamsMessage(makeEnvelope(), APP_URL);
    const card = (msg.attachments as any[])[0].content;
    expect(card.actions).toBeDefined();
    expect(card.actions[0].type).toBe('Action.OpenUrl');
    expect(card.actions[0].url).toBe('https://studio.example.com/evidence/ev-123');
  });
});

// ---------------------------------------------------------------------------
// Mattermost formatter
// ---------------------------------------------------------------------------

describe('formatMattermostMessage', () => {
  it('should include username and attachments', () => {
    const msg = formatMattermostMessage(makeEnvelope(), APP_URL);
    expect(msg.username).toBe('Assessors Studio');
    expect(msg).toHaveProperty('attachments');
    const attachments = msg.attachments as any[];
    expect(attachments).toHaveLength(1);
  });

  it('should include color based on event nature', () => {
    const msg = formatMattermostMessage(
      makeEnvelope({ type: 'evidence.created', data: { name: 'Test', evidenceId: 'e1' } }),
      APP_URL,
    );
    const att = (msg.attachments as any[])[0];
    expect(att.color).toBe('#2196F3'); // blue for created
  });

  it('should include a title and fields', () => {
    const msg = formatMattermostMessage(makeEnvelope(), APP_URL);
    const att = (msg.attachments as any[])[0];
    expect(att.title).toContain('Evidence');
    expect(att.fields.length).toBeGreaterThan(0);
  });

  it('should include actor in fields', () => {
    const msg = formatMattermostMessage(makeEnvelope(), APP_URL);
    const att = (msg.attachments as any[])[0];
    const actorField = att.fields.find((f: any) => f.title === 'Action by');
    expect(actorField?.value).toBe('Jane Smith');
  });

  it('should include title_link when URL is available', () => {
    const msg = formatMattermostMessage(makeEnvelope(), APP_URL);
    const att = (msg.attachments as any[])[0];
    expect(att.title_link).toBe('https://studio.example.com/evidence/ev-123');
  });
});

// ---------------------------------------------------------------------------
// Webhook URL validation
// ---------------------------------------------------------------------------

describe('Webhook URL validation', () => {
  it('Slack: should accept valid URLs', async () => {
    const { SlackChannel } = await import('../../events/channels/chat-slack.js');
    expect(SlackChannel.validateWebhookUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true);
  });

  it('Slack: should reject non-Slack URLs', async () => {
    const { SlackChannel } = await import('../../events/channels/chat-slack.js');
    expect(SlackChannel.validateWebhookUrl('https://example.com/hook')).toBe(false);
    expect(SlackChannel.validateWebhookUrl('http://hooks.slack.com/services/T00/B00/xxx')).toBe(false);
  });

  it('Teams: should accept valid URLs', async () => {
    const { TeamsChannel } = await import('../../events/channels/chat-teams.js');
    expect(TeamsChannel.validateWebhookUrl('https://org.webhook.office.com/webhookb2/...')).toBe(true);
    expect(TeamsChannel.validateWebhookUrl('https://prod.logic.azure.com/workflows/...')).toBe(true);
  });

  it('Teams: should reject non-Teams URLs', async () => {
    const { TeamsChannel } = await import('../../events/channels/chat-teams.js');
    expect(TeamsChannel.validateWebhookUrl('https://example.com/webhook')).toBe(false);
    expect(TeamsChannel.validateWebhookUrl('http://org.webhook.office.com/')).toBe(false);
  });

  it('Mattermost: should accept any HTTPS URL', async () => {
    const { MattermostChannel } = await import('../../events/channels/chat-mattermost.js');
    expect(MattermostChannel.validateWebhookUrl('https://mm.example.com/hooks/xxx')).toBe(true);
  });

  it('Mattermost: should reject HTTP URLs', async () => {
    const { MattermostChannel } = await import('../../events/channels/chat-mattermost.js');
    expect(MattermostChannel.validateWebhookUrl('http://mm.example.com/hooks/xxx')).toBe(false);
  });
});
