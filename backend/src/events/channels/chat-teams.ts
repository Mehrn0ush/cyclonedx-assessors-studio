/**
 * Microsoft Teams notification channel.
 *
 * Sends event notifications to Teams channels via incoming webhooks
 * using Adaptive Card message format.
 */

import type { EventEnvelope } from '../types.js';
import { BaseChatChannel } from './chat-base.js';
import { formatTeamsMessage } from './chat-formatters.js';

export class TeamsChannel extends BaseChatChannel {
  platform = 'teams';

  formatMessage(envelope: EventEnvelope, appUrl: string): Record<string, unknown> {
    return formatTeamsMessage(envelope, appUrl);
  }

  /**
   * Validate webhook URL format for Teams.
   * Must start with https:// and contain .webhook.office.com/ or .logic.azure.com/
   */
  static validateWebhookUrl(url: string): boolean {
    if (!url.startsWith('https://')) return false;
    return url.includes('.webhook.office.com/') || url.includes('.logic.azure.com/');
  }
}
