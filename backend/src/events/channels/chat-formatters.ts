/**
 * Chat message formatters for Slack, Microsoft Teams, and Mattermost (spec 006).
 *
 * Each platform uses a different message structure:
 *   - Slack: Block Kit JSON
 *   - Teams: Adaptive Cards wrapped in a message envelope
 *   - Mattermost: Markdown with attachments
 *
 * All formatters accept an EventEnvelope and an application base URL,
 * and return a platform-specific payload ready to POST to the webhook.
 */

import type { EventEnvelope } from '../types.js';

// ---------------------------------------------------------------------------
// Color palettes per event nature
// ---------------------------------------------------------------------------

type EventNature = 'created' | 'approved' | 'rejected' | 'stateChange';

const SLACK_COLORS: Record<EventNature, string> = {
  created: '#2196F3',
  approved: '#4CAF50',
  rejected: '#F44336',
  stateChange: '#FF9800',
};

const TEAMS_COLORS: Record<EventNature, string> = {
  created: 'Accent',
  approved: 'Good',
  rejected: 'Attention',
  stateChange: 'Warning',
};

const MATTERMOST_COLORS: Record<EventNature, string> = {
  created: '#2196F3',
  approved: '#36a64f',
  rejected: '#d00000',
  stateChange: '#ff9800',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify an event type string into a visual nature for color coding.
 */
export function getEventNature(eventType: string): EventNature {
  if (eventType.includes('created') || eventType.includes('imported')) {
    return 'created';
  }
  if (
    eventType.includes('approved') ||
    eventType.includes('signed') ||
    eventType.includes('completed') ||
    eventType.includes('exported')
  ) {
    return 'approved';
  }
  if (
    eventType.includes('rejected') ||
    eventType.includes('failed') ||
    eventType.includes('deleted') ||
    eventType.includes('disabled')
  ) {
    return 'rejected';
  }
  return 'stateChange';
}

/**
 * Build a human-readable summary line from the event type and data.
 */
export function getSummary(eventType: string, data: Record<string, unknown>): string {
  const name = (data.name || data.title || data.entityName) as string | undefined;
  const state = (data.state || data.newState) as string | undefined;

  if (eventType.includes('assessment')) {
    if (eventType.includes('created')) return `Assessment Created: ${name || 'New Assessment'}`;
    if (eventType.includes('state_changed')) return `Assessment ${state || 'Updated'}`;
    if (eventType.includes('assigned')) return `Assessment Assigned: ${name || 'Assessment'}`;
    if (eventType.includes('deleted')) return `Assessment Deleted: ${name || 'Assessment'}`;
  }

  if (eventType.includes('evidence')) {
    if (eventType.includes('created')) return `Evidence Created: ${name || 'New Evidence'}`;
    if (eventType.includes('state_changed')) return `Evidence ${state || 'Updated'}`;
    if (eventType.includes('attachment_added')) return `Evidence Attachment Added: ${name || 'Evidence'}`;
    if (eventType.includes('attachment_removed')) return `Evidence Attachment Removed: ${name || 'Evidence'}`;
  }

  if (eventType.includes('attestation')) {
    if (eventType.includes('created')) return `Attestation Created: ${name || 'New Attestation'}`;
    if (eventType.includes('signed')) return `Attestation Signed: ${name || 'Attestation'}`;
    if (eventType.includes('exported')) return `Attestation Exported: ${name || 'Attestation'}`;
  }

  if (eventType.includes('claim')) {
    if (eventType.includes('created')) return `Claim Created: ${name || 'New Claim'}`;
    if (eventType.includes('updated')) return `Claim Updated: ${name || 'Claim'}`;
  }

  if (eventType.includes('project')) {
    if (eventType.includes('created')) return `Project Created: ${name || 'New Project'}`;
    if (eventType.includes('state_changed')) return `Project ${state || 'Updated'}`;
    if (eventType.includes('archived')) return `Project Archived: ${name || 'Project'}`;
  }

  if (eventType.includes('standard')) {
    if (eventType.includes('imported')) return `Standard Imported: ${name || 'New Standard'}`;
    if (eventType.includes('state_changed')) return `Standard ${state || 'Updated'}`;
  }

  // Fallback: convert dot-separated type to readable string
  return eventType.replace(/\./g, ' ').replace(/_/g, ' ');
}

/**
 * Build an action URL back to the application based on event data.
 */
export function buildActionUrl(appUrl: string, envelope: EventEnvelope): string | null {
  if (!appUrl) return null;
  const baseUrl = appUrl.replace(/\/$/, '');
  const data = envelope.data;

  if (data.evidenceId) return `${baseUrl}/evidence/${data.evidenceId}`;
  if (data.assessmentId) return `${baseUrl}/assessments/${data.assessmentId}`;
  if (data.attestationId) return `${baseUrl}/attestations/${data.attestationId}`;
  if (data.claimId) return `${baseUrl}/claims/${data.claimId}`;
  if (data.projectId) return `${baseUrl}/projects/${data.projectId}`;
  if (data.standardId) return `${baseUrl}/standards/${data.standardId}`;
  if (data.entityId) return `${baseUrl}/entities/${data.entityId}`;

  return null;
}

interface MessageField {
  title: string;
  value: string;
}

/**
 * Extract display fields from event data.
 */
export function buildEventFields(data: Record<string, unknown>): MessageField[] {
  const fields: MessageField[] = [];

  const fieldMap: Record<string, string> = {
    name: 'Name',
    title: 'Title',
    description: 'Description',
    state: 'State',
    newState: 'New State',
    previousState: 'Previous State',
    projectName: 'Project',
    entityName: 'Entity',
    standardName: 'Standard',
    evidenceName: 'Evidence',
    assessmentName: 'Assessment',
    assessmentTitle: 'Assessment',
    attestationName: 'Attestation',
    claimName: 'Claim',
    email: 'Email',
    role: 'Role',
  };

  for (const [key, title] of Object.entries(fieldMap)) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      fields.push({ title, value: String(data[key]) });
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Slack Block Kit
// ---------------------------------------------------------------------------

export function formatSlackMessage(envelope: EventEnvelope, appUrl: string): Record<string, unknown> {
  const summary = getSummary(envelope.type, envelope.data);
  const actionUrl = buildActionUrl(appUrl, envelope);
  const fields = buildEventFields(envelope.data);

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: summary },
    },
  ];

  if (fields.length > 0) {
    blocks.push({
      type: 'section',
      fields: fields.map((f) => ({
        type: 'mrkdwn',
        text: `*${f.title}:*\n${f.value}`,
      })),
    });
  }

  if (envelope.actor.displayName) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `Action by *${envelope.actor.displayName}*` },
    });
  }

  if (actionUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Details' },
          url: actionUrl,
        },
      ],
    });
  }

  blocks.push({ type: 'divider' });

  return { blocks };
}

// ---------------------------------------------------------------------------
// Microsoft Teams Adaptive Cards
// ---------------------------------------------------------------------------

export function formatTeamsMessage(envelope: EventEnvelope, appUrl: string): Record<string, unknown> {
  const summary = getSummary(envelope.type, envelope.data);
  const actionUrl = buildActionUrl(appUrl, envelope);
  const fields = buildEventFields(envelope.data);

  const facts: Array<{ title: string; value: string }> = [];
  for (const f of fields) {
    facts.push({ title: f.title, value: f.value });
  }
  if (envelope.actor.displayName) {
    facts.push({ title: 'By', value: envelope.actor.displayName });
  }

  const body: Record<string, unknown>[] = [
    {
      type: 'TextBlock',
      text: summary,
      weight: 'Bolder',
      size: 'Medium',
    },
  ];

  if (facts.length > 0) {
    body.push({ type: 'FactSet', facts });
  }

  const actions: Record<string, unknown>[] = [];
  if (actionUrl) {
    actions.push({
      type: 'Action.OpenUrl',
      title: 'View Details',
      url: actionUrl,
    });
  }

  const content: Record<string, unknown> = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body,
  };
  if (actions.length > 0) {
    content.actions = actions;
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: undefined,
        content,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mattermost Markdown Attachments
// ---------------------------------------------------------------------------

export function formatMattermostMessage(envelope: EventEnvelope, appUrl: string): Record<string, unknown> {
  const nature = getEventNature(envelope.type);
  const color = MATTERMOST_COLORS[nature];
  const summary = getSummary(envelope.type, envelope.data);
  const actionUrl = buildActionUrl(appUrl, envelope);
  const fields = buildEventFields(envelope.data);

  const mattermostFields = fields.map((f) => ({
    short: true,
    title: f.title,
    value: f.value,
  }));

  if (envelope.actor.displayName) {
    mattermostFields.push({
      short: false,
      title: 'Action by',
      value: envelope.actor.displayName,
    });
  }

  const attachment: Record<string, unknown> = {
    fallback: summary,
    color,
    title: summary,
    fields: mattermostFields,
  };

  if (actionUrl) {
    attachment.title_link = actionUrl;
  }

  return {
    username: 'Assessors Studio',
    attachments: [attachment],
  };
}

// Re-export color maps for testing
export { SLACK_COLORS, TEAMS_COLORS, MATTERMOST_COLORS };
