/**
 * Email templates for the email notification channel.
 *
 * Each template function returns { subject, text, html } for an event
 * type. Templates produce clean plain text and a minimal HTML
 * alternative with inline CSS, no images, and no tracking.
 */

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Footer helpers
// ---------------------------------------------------------------------------

function getFooter(appUrl: string | undefined, reason: string): string {
  const settingsLink = appUrl
    ? `${appUrl}/settings/notifications`
    : 'https://studio.example.com/settings/notifications';

  return `---
You received this email because ${reason}.
Manage your notification preferences:
${settingsLink}`;
}

function getHtmlFooter(appUrl: string | undefined, reason: string): string {
  const settingsLink = appUrl
    ? `${appUrl}/settings/notifications`
    : 'https://studio.example.com/settings/notifications';

  return `<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
<p style="font-size: 12px; color: #666; margin: 10px 0;">
  You received this email because ${reason}.<br/>
  <a href="${settingsLink}" style="color: #0066cc; text-decoration: none;">Manage your notification preferences</a>
</p>`;
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function actionButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">${label}</a>`;
}

// ---------------------------------------------------------------------------
// Assessment templates
// ---------------------------------------------------------------------------

export function assessmentCreatedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { assessmentTitle, projectName, actorName } = data as {
    assessmentTitle?: string;
    projectName?: string;
    actorName?: string;
  };

  const subject = `Assessment "${assessmentTitle}" created in "${projectName}"`;
  const link = appUrl ? `${appUrl}/assessments` : 'https://studio.example.com/assessments';

  const text = `Assessment "${assessmentTitle}" has been created in project "${projectName}".

Created by: ${actorName || 'Unknown'}
Date: ${formatDate()}

View this assessment:
${link}

${getFooter(appUrl, 'you are a member of this project')}`;

  const html = `<p>Assessment <strong>"${assessmentTitle}"</strong> has been created in project <strong>"${projectName}"</strong>.</p>

<p>
  <strong>Created by:</strong> ${actorName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this assessment')}</p>

${getHtmlFooter(appUrl, 'you are a member of this project')}`;

  return { subject, text, html };
}

export function assessmentReadyForReviewTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { assessmentTitle, projectName, assessmentId } = data as {
    assessmentTitle?: string;
    projectName?: string;
    assessmentId?: string;
  };

  const subject = `Assessment "${assessmentTitle}" is ready for review`;
  const link = appUrl
    ? `${appUrl}/assessments/${assessmentId}`
    : 'https://studio.example.com/assessments';

  const text = `Assessment "${assessmentTitle}" is ready for your review.

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

Review this assessment:
${link}

${getFooter(appUrl, 'you are an assessor on this project')}`;

  const html = `<p>Assessment <strong>"${assessmentTitle}"</strong> is ready for your review.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'Review this assessment')}</p>

${getHtmlFooter(appUrl, 'you are an assessor on this project')}`;

  return { subject, text, html };
}

export function assessmentCompletedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { assessmentTitle, projectName, assessmentId } = data as {
    assessmentTitle?: string;
    projectName?: string;
    assessmentId?: string;
  };

  const subject = `Assessment "${assessmentTitle}" has been completed`;
  const link = appUrl
    ? `${appUrl}/assessments/${assessmentId}`
    : 'https://studio.example.com/assessments';

  const text = `Assessment "${assessmentTitle}" has been completed.

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

View this assessment:
${link}

${getFooter(appUrl, 'you are a member of this project')}`;

  const html = `<p>Assessment <strong>"${assessmentTitle}"</strong> has been completed.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this assessment')}</p>

${getHtmlFooter(appUrl, 'you are a member of this project')}`;

  return { subject, text, html };
}

export function assessmentAssignedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { assessmentTitle, projectName, assessmentId } = data as {
    assessmentTitle?: string;
    projectName?: string;
    assessmentId?: string;
  };

  const subject = `You have been assigned to assessment "${assessmentTitle}"`;
  const link = appUrl
    ? `${appUrl}/assessments/${assessmentId}`
    : 'https://studio.example.com/assessments';

  const text = `You have been assigned to assessment "${assessmentTitle}".

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

View this assessment:
${link}

${getFooter(appUrl, 'you have been assigned to this assessment')}`;

  const html = `<p>You have been assigned to assessment <strong>"${assessmentTitle}"</strong>.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this assessment')}</p>

${getHtmlFooter(appUrl, 'you have been assigned to this assessment')}`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Evidence templates
// ---------------------------------------------------------------------------

export function evidenceCreatedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { evidenceName, projectName, evidenceId, submittedBy } = data as {
    evidenceName?: string;
    projectName?: string;
    evidenceId?: string;
    submittedBy?: string;
  };

  const subject = `New evidence "${evidenceName}" submitted for review`;
  const link = appUrl
    ? `${appUrl}/evidence/${evidenceId}`
    : 'https://studio.example.com/evidence';

  const text = `Evidence "${evidenceName}" has been submitted for your review.

Project: ${projectName || 'Unknown'}
Submitted by: ${submittedBy || 'Unknown'}
Date: ${formatDate()}

View this evidence:
${link}

${getFooter(appUrl, 'you are assigned as the reviewer for this evidence')}`;

  const html = `<p>Evidence <strong>"${evidenceName}"</strong> has been submitted for your review.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Submitted by:</strong> ${submittedBy || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this evidence')}</p>

${getHtmlFooter(appUrl, 'you are assigned as the reviewer for this evidence')}`;

  return { subject, text, html };
}

export function evidenceReadyForReviewTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { evidenceName, projectName, evidenceId, submittedBy } = data as {
    evidenceName?: string;
    projectName?: string;
    evidenceId?: string;
    submittedBy?: string;
  };

  const subject = `Evidence "${evidenceName}" is ready for your review`;
  const link = appUrl
    ? `${appUrl}/evidence/${evidenceId}`
    : 'https://studio.example.com/evidence';

  const text = `Evidence "${evidenceName}" is ready for your review.

Project: ${projectName || 'Unknown'}
Submitted by: ${submittedBy || 'Unknown'}
Date: ${formatDate()}

View this evidence:
${link}

${getFooter(appUrl, 'you are assigned as the reviewer for this evidence')}`;

  const html = `<p>Evidence <strong>"${evidenceName}"</strong> is ready for your review.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Submitted by:</strong> ${submittedBy || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this evidence')}</p>

${getHtmlFooter(appUrl, 'you are assigned as the reviewer for this evidence')}`;

  return { subject, text, html };
}

export function evidenceApprovedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { evidenceName, projectName, evidenceId } = data as {
    evidenceName?: string;
    projectName?: string;
    evidenceId?: string;
  };

  const subject = `Your evidence "${evidenceName}" has been approved`;
  const link = appUrl
    ? `${appUrl}/evidence/${evidenceId}`
    : 'https://studio.example.com/evidence';

  const text = `Your evidence "${evidenceName}" has been approved.

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

View this evidence:
${link}

${getFooter(appUrl, 'you submitted this evidence')}`;

  const html = `<p>Your evidence <strong>"${evidenceName}"</strong> has been approved.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'View this evidence')}</p>

${getHtmlFooter(appUrl, 'you submitted this evidence')}`;

  return { subject, text, html };
}

export function evidenceRejectedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { evidenceName, projectName, evidenceId, rejectionReason } = data as {
    evidenceName?: string;
    projectName?: string;
    evidenceId?: string;
    rejectionReason?: string;
  };

  const subject = `Your evidence "${evidenceName}" needs revision`;
  const link = appUrl
    ? `${appUrl}/evidence/${evidenceId}`
    : 'https://studio.example.com/evidence';

  const text = `Your evidence "${evidenceName}" needs revision.

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

${rejectionReason ? `Feedback: ${rejectionReason}\n` : ''}
View this evidence:
${link}

${getFooter(appUrl, 'you submitted this evidence')}`;

  const html = `<p>Your evidence <strong>"${evidenceName}"</strong> needs revision.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

${rejectionReason ? `<p><strong>Feedback:</strong> ${rejectionReason}</p>` : ''}

<p>${actionButton(link, 'View this evidence')}</p>

${getHtmlFooter(appUrl, 'you submitted this evidence')}`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Attestation templates
// ---------------------------------------------------------------------------

export function attestationCreatedTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { attestationId, projectName } = data as {
    attestationId?: string;
    projectName?: string;
  };

  const subject = 'Attestation requires your signature';
  const link = appUrl
    ? `${appUrl}/attestations/${attestationId}`
    : 'https://studio.example.com/attestations';

  const text = `An attestation requires your signature.

Project: ${projectName || 'Unknown'}
Date: ${formatDate()}

Sign this attestation:
${link}

${getFooter(appUrl, 'you have been assigned as a signatory for this attestation')}`;

  const html = `<p>An attestation requires your signature.</p>

<p>
  <strong>Project:</strong> ${projectName || 'Unknown'}<br/>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'Sign this attestation')}</p>

${getHtmlFooter(appUrl, 'you have been assigned as a signatory for this attestation')}`;

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// System templates
// ---------------------------------------------------------------------------

export function webhookDisabledTemplate(
  data: Record<string, unknown>,
  appUrl: string | undefined,
): EmailTemplate {
  const { webhookName, consecutiveFailures } = data as {
    webhookName?: string;
    consecutiveFailures?: number;
  };

  const subject = `Webhook "${webhookName}" has been disabled`;
  const link = appUrl
    ? `${appUrl}/admin/webhooks`
    : 'https://studio.example.com/admin/webhooks';

  const text = `Webhook "${webhookName}" has been automatically disabled due to consecutive delivery failures (${consecutiveFailures} failures).

Date: ${formatDate()}

Manage your webhooks:
${link}

${getFooter(appUrl, 'you are an administrator')}`;

  const html = `<p>Webhook <strong>"${webhookName}"</strong> has been automatically disabled due to consecutive delivery failures (${consecutiveFailures} failures).</p>

<p>
  <strong>Date:</strong> ${formatDate()}
</p>

<p>${actionButton(link, 'Manage your webhooks')}</p>

${getHtmlFooter(appUrl, 'you are an administrator')}`;

  return { subject, text, html };
}
