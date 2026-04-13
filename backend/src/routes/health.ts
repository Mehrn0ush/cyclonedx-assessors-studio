import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from '../db/connection.js';
import { asyncHandler } from '../utils/route-helpers.js';
import { AuthRequest, tryAuthenticate } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const serverStartTime = Date.now();

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

// Track database connectivity via a lightweight periodic check
let databaseConnected = true;
let dbCheckTimer: ReturnType<typeof setInterval> | null = null;

async function checkDatabaseConnectivity(): Promise<void> {
  try {
    const db = getDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.executeQuery({
      sql: 'SELECT 1 AS ok',
      parameters: [],
    // biome-ignore lint/suspicious/noExplicitAny: Kysely executeQuery requires CompiledQuery
    } as any);
    databaseConnected = true;
  } catch {
    databaseConnected = false;
  }
}

/** Start periodic DB health check (every 30s). */
export function startHealthChecks(): void {
  checkDatabaseConnectivity().catch(() => {});
  dbCheckTimer = setInterval(() => {
    checkDatabaseConnectivity().catch(() => {});
  }, 30_000);
}

/** Stop periodic DB health check. */
export function stopHealthChecks(): void {
  if (dbCheckTimer) {
    clearInterval(dbCheckTimer);
    dbCheckTimer = null;
  }
}

/**
 * GET /api/health
 *
 * Unauthenticated callers receive a simple status check (liveness probe).
 * Authenticated callers receive version, uptime, and database status
 * (readiness probe). Detailed system metrics are now served via the
 * Prometheus endpoint at /metrics.
 */
router.get('/', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const user = await tryAuthenticate(req as AuthRequest);

  if (!user) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Authenticated: return simplified health with database connectivity
  const pkgPath = path.resolve(__dirname, '../../../package.json');
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    version = pkg.version || version;
  } catch { /* use fallback */ }

  const uptimeMs = Date.now() - serverStartTime;

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version,
    uptime: formatUptime(uptimeMs),
    database: databaseConnected ? 'connected' : 'disconnected',
  });
}));

export default router;
