/**
 * GET /metrics endpoint.
 *
 * Returns metrics in Prometheus exposition format. Supports optional
 * bearer token authentication via the METRICS_TOKEN environment variable.
 */

import { Router, Request, Response } from 'express';
import { getConfig } from '../config/index.js';
import { registry } from '../metrics/index.js';

const router = Router();

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const config = getConfig();

  if (!config.METRICS_ENABLED) {
    res.status(404).json({ error: 'Metrics endpoint is disabled' });
    return;
  }

  // Optional bearer token auth
  if (config.METRICS_TOKEN) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization required' });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== config.METRICS_TOKEN) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
  }

  try {
    const metrics = await registry.metrics();
    res.set('Content-Type', registry.contentType);
    res.end(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

export default router;
