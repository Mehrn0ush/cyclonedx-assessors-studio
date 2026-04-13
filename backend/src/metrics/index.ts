/**
 * Prometheus metrics registry and catalog.
 *
 * Uses prom-client to define application level metrics. The registry
 * is a singleton; all metric objects are created once and reused
 * throughout the application lifecycle.
 */

import client from 'prom-client';
import { getConfig } from '../config/index.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const config = getConfig();
const prefix = config.METRICS_PREFIX;

export const registry = new client.Registry();
registry.setDefaultLabels({ app: 'assessors-studio' });

// Collect default Node.js / process metrics (CPU, memory, event loop, GC)
client.collectDefaultMetrics({ register: registry, prefix });

// ---------------------------------------------------------------------------
// HTTP Request Metrics (populated by metricsMiddleware)
// ---------------------------------------------------------------------------

export const httpRequestsTotal = new client.Counter({
  name: `${prefix}http_requests_total`,
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: `${prefix}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestSize = new client.Histogram({
  name: `${prefix}http_request_size_bytes`,
  help: 'HTTP request body size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [registry],
});

export const httpResponseSize = new client.Histogram({
  name: `${prefix}http_response_size_bytes`,
  help: 'HTTP response body size in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Authentication Metrics
// ---------------------------------------------------------------------------

export const authLoginTotal = new client.Counter({
  name: `${prefix}auth_login_total`,
  help: 'Login attempts by method and result',
  labelNames: ['method', 'result'] as const,
  registers: [registry],
});

export const authActiveSessions = new client.Gauge({
  name: `${prefix}auth_active_sessions`,
  help: 'Currently active (non-expired) sessions',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Domain Metrics (gauges refreshed periodically)
// ---------------------------------------------------------------------------

export const assessmentsTotal = new client.Gauge({
  name: `${prefix}assessments_total`,
  help: 'Assessment count by state',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const evidenceTotal = new client.Gauge({
  name: `${prefix}evidence_total`,
  help: 'Evidence count by state',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const claimsTotal = new client.Gauge({
  name: `${prefix}claims_total`,
  help: 'Total claim records',
  registers: [registry],
});

export const attestationsTotal = new client.Gauge({
  name: `${prefix}attestations_total`,
  help: 'Total attestation records',
  registers: [registry],
});

export const projectsTotal = new client.Gauge({
  name: `${prefix}projects_total`,
  help: 'Project count by state',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const usersTotal = new client.Gauge({
  name: `${prefix}users_total`,
  help: 'User count by role and active status',
  labelNames: ['role', 'active'] as const,
  registers: [registry],
});

export const standardsTotal = new client.Gauge({
  name: `${prefix}standards_total`,
  help: 'Total imported standards',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Notification Channel Metrics
// ---------------------------------------------------------------------------

export const webhookDeliveriesTotal = new client.Counter({
  name: `${prefix}webhook_deliveries_total`,
  help: 'Webhook delivery attempts by outcome',
  labelNames: ['event_type', 'status'] as const,
  registers: [registry],
});

export const webhookDeliveryDuration = new client.Histogram({
  name: `${prefix}webhook_delivery_duration_seconds`,
  help: 'Time to deliver a webhook',
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
});

export const emailDeliveriesTotal = new client.Counter({
  name: `${prefix}email_deliveries_total`,
  help: 'Email delivery attempts by outcome',
  labelNames: ['event_type', 'status'] as const,
  registers: [registry],
});

export const chatDeliveriesTotal = new client.Counter({
  name: `${prefix}chat_deliveries_total`,
  help: 'Chat delivery attempts by platform and outcome',
  labelNames: ['platform', 'event_type', 'status'] as const,
  registers: [registry],
});

export const eventsEmittedTotal = new client.Counter({
  name: `${prefix}events_emitted_total`,
  help: 'Total events emitted on the event bus',
  labelNames: ['type'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Domain Gauge Refresh
// ---------------------------------------------------------------------------

let domainRefreshTimer: ReturnType<typeof setInterval> | null = null;

// ---- Helper functions for gauge updates ----

/**
 * Refresh assessments gauge (by state).
 */
async function refreshAssessmentGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('assessment')
      .select(['state', db.fn.count<number>('id').as('count')])
      .groupBy('state')
      .execute();
    assessmentsTotal.reset();
    for (const row of rows) {
      assessmentsTotal.set({ state: row.state ?? 'unknown' }, Number(row.count));
    }
  } catch (error) {
    logger.debug('refreshAssessmentGauge skipped', { error });
  }
}

/**
 * Refresh evidence gauge (by state).
 */
async function refreshEvidenceGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('evidence')
      .select(['state', db.fn.count<number>('id').as('count')])
      .groupBy('state')
      .execute();
    evidenceTotal.reset();
    for (const row of rows) {
      evidenceTotal.set({ state: row.state || 'unknown' }, Number(row.count));
    }
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh projects gauge (by state).
 */
async function refreshProjectsGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('project')
      .select(['state', db.fn.count<number>('id').as('count')])
      .groupBy('state')
      .execute();
    projectsTotal.reset();
    for (const row of rows) {
      projectsTotal.set({ state: row.state || 'unknown' }, Number(row.count));
    }
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh users gauge (by role and active status).
 */
async function refreshUsersGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('app_user')
      .select(['role', 'is_active', db.fn.count<number>('id').as('count')])
      .groupBy(['role', 'is_active'])
      .execute();
    usersTotal.reset();
    for (const row of rows) {
      usersTotal.set(
        { role: row.role || 'unknown', active: String(row.is_active) },
        Number(row.count),
      );
    }
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh claims total gauge (simple count).
 */
async function refreshClaimsGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('claim')
      .select(db.fn.count<number>('id').as('count'))
      .execute();
    claimsTotal.set(Number(rows[0]?.count ?? 0));
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh attestations total gauge (simple count).
 */
async function refreshAttestationsGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('attestation')
      .select(db.fn.count<number>('id').as('count'))
      .execute();
    attestationsTotal.set(Number(rows[0]?.count ?? 0));
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh standards total gauge (simple count).
 */
async function refreshStandardsGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('standard')
      .select(db.fn.count<number>('id').as('count'))
      .execute();
    standardsTotal.set(Number(rows[0]?.count ?? 0));
  } catch { /* table may not exist yet */ }
}

/**
 * Refresh active sessions gauge (non-expired sessions only).
 */
async function refreshSessionsGauge(db: ReturnType<typeof getDatabase>): Promise<void> {
  try {
    const rows = await db
      .selectFrom('session')
      .select(db.fn.count<number>('id').as('count'))
      .where('expires_at', '>', new Date())
      .execute();
    authActiveSessions.set(Number(rows[0]?.count ?? 0));
  } catch { /* table may not exist yet */ }
}

/**
 * Query the database and update all domain gauges.
 */
export async function refreshDomainGauges(): Promise<void> {
  try {
    const db = getDatabase();

    await refreshAssessmentGauge(db);
    await refreshEvidenceGauge(db);
    await refreshProjectsGauge(db);
    await refreshUsersGauge(db);
    await refreshClaimsGauge(db);
    await refreshAttestationsGauge(db);
    await refreshStandardsGauge(db);
    await refreshSessionsGauge(db);
  } catch (error) {
    logger.warn('Failed to refresh domain gauges', { error });
  }
}

/**
 * Start the periodic domain gauge refresh timer.
 */
export function startDomainGaugeRefresh(): void {
  const intervalMs = config.METRICS_DOMAIN_REFRESH_INTERVAL * 1000;
  // Run once immediately, then on the interval
  refreshDomainGauges().catch(() => {});
  domainRefreshTimer = setInterval(() => {
    refreshDomainGauges().catch(() => {});
  }, intervalMs);
}

/**
 * Stop the periodic domain gauge refresh timer.
 */
export function stopDomainGaugeRefresh(): void {
  if (domainRefreshTimer) {
    clearInterval(domainRefreshTimer);
    domainRefreshTimer = null;
  }
}
