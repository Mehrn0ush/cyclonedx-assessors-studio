import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from '../config/index.js';
import { tryAuthenticate } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = getConfig();
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

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function getDiskUsage(dir: string): { total: string; used: string; free: string } | null {
  try {
    const stats = fs.statfsSync(dir);
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bavail;
    const used = total - free;
    return {
      total: formatBytes(total),
      used: formatBytes(used),
      free: formatBytes(free),
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/health
 *
 * Unauthenticated callers receive a simple status check.
 * Authenticated callers (session cookie or API key) receive detailed
 * system metrics suitable for Prometheus or operational dashboards.
 */
router.get('/', async (req: Request, res: Response) => {
  const user = await tryAuthenticate(req as any);

  if (!user) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Authenticated: return detailed system metrics
  const mem = process.memoryUsage();
  const heapTotal = mem.heapTotal;
  const heapUsed = mem.heapUsed;
  const heapPercent = heapTotal > 0 ? ((heapUsed / heapTotal) * 100).toFixed(2) : '0.00';

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = ((usedMem / totalMem) * 100).toFixed(2);
  const memAlert = parseFloat(memPercent) > 90 ? 'high' : null;

  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  const loadAlert = loadAvg[0] > cpuCount * 0.8 ? 'high' : null;

  const disk = getDiskUsage(config.PGLITE_DATA_DIR || '.');

  const pkgPath = path.resolve(__dirname, '../../../package.json');
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    version = pkg.version || version;
  } catch { /* use fallback */ }

  const uptimeMs = Date.now() - serverStartTime;

  res.json({
    status: 'healthy',
    uptime: formatUptime(uptimeMs),
    version,
    environment: config.NODE_ENV,
    memory: {
      heapUsed: formatBytes(heapUsed),
      heapUsedPercent: `${heapPercent}%`,
      rss: formatBytes(mem.rss),
    },
    system: {
      platform: os.platform(),
      memory: {
        usedPercent: `${memPercent}%`,
        alert: memAlert,
      },
      loadavg: {
        '1min': loadAvg[0].toFixed(2),
        alert: loadAlert,
      },
    },
    ...(disk ? { disk } : {}),
  });
});

export default router;
