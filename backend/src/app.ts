import express from 'express';
import type { Request, Response, NextFunction, Express } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/security.js';
import type { AuthRequest } from './middleware/auth.js';
import { requireSetup } from './middleware/setup.js';
import healthRoutes from './routes/health.js';
import { camelCaseResponse } from './middleware/camelCase.js';
import setupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import standardRoutes from './routes/standards.js';
import assessmentRoutes from './routes/assessments.js';
import entityRoutes from './routes/entities.js';
import evidenceRoutes from './routes/evidence.js';
import apikeyRoutes from './routes/apikeys.js';
import claimRoutes from './routes/claims.js';
import attestationRoutes from './routes/attestations.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import roleRoutes from './routes/roles.js';
import tagRoutes from './routes/tags.js';
import importRoutes from './routes/import.js';
import exportRoutes from './routes/export.js';
import auditRoutes from './routes/audit.js';
import notificationRoutes from './routes/notifications.js';
import notificationRulesRoutes from './routes/notification-rules.js';
import adminNotificationRulesRoutes from './routes/admin-notification-rules.js';
import assessorRoutes from './routes/assessors.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import adminEncryptionRoutes from './routes/admin-encryption.js';
import chatIntegrationRoutes from './routes/chat-integrations.js';
import metricsRoutes from './routes/metrics.js';
import { getOpenAPISpec } from './openapi.js';
import { getEventBus } from './events/index.js';
import { metricsMiddleware } from './middleware/metrics.js';

// Helper: Configure security middleware
function configureSecurityMiddleware(app: Express): void {
  const config = getConfig();
  app.use(helmet({
    contentSecurityPolicy: config.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    } : false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: 'deny',
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },
  }));
}

// Helper: Configure CORS
function configureCORS(app: Express): void {
  const config = getConfig();
  app.use(cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key'],
  }));
}

// Helper: Configure rate limiters
function configureRateLimiters(app: Express): void {
  const config = getConfig();
  if (config.NODE_ENV === 'test') return;

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later.',
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many authentication attempts, please try again later.',
  });

  const heavyOpLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 120,
    message: 'Too many resource-intensive requests, please try again later.',
  });

  const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many setup requests, please try again later.',
  });

  app.use(generalLimiter);
  app.use('/api/v1/auth', authLimiter);
  app.use('/api/v1/import', heavyOpLimiter);
  app.use('/api/v1/export', heavyOpLimiter);
  app.use('/api/v1/evidence', heavyOpLimiter);
  app.use('/api/v1/setup', setupLimiter);
}

// Helper: Configure body parsing and cookies
function configureBodyParsing(app: Express): void {
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());
}

// Helper: Configure request-level middleware
function configureRequestMiddleware(app: Express): void {
  const config = getConfig();
  app.use(requestIdMiddleware);

  const metricsConfig = getConfig();
  if (metricsConfig.METRICS_ENABLED) {
    app.use(metricsMiddleware);
  }

  app.use((req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      req.eventBus = getEventBus();
    } catch {
      // Event system may not be initialized yet (e.g., during setup)
    }
    next();
  });

  app.use('/api/v1', camelCaseResponse);

  if (config.NODE_ENV !== 'test') {
    app.use((req: AuthRequest, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration: `${duration}ms`,
          requestId: req.requestId,
        });
      });
      next();
    });
  }
}

// Helper: Register API routes
function registerAPIRoutes(app: Express): void {
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/projects', projectRoutes);
  app.use('/api/v1/standards', standardRoutes);
  app.use('/api/v1/assessments', assessmentRoutes);
  app.use('/api/v1/entities', entityRoutes);
  app.use('/api/v1/evidence', evidenceRoutes);
  app.use('/api/v1/apikeys', apikeyRoutes);
  app.use('/api/v1/claims', claimRoutes);
  app.use('/api/v1/attestations', attestationRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/roles', roleRoutes);
  app.use('/api/v1/tags', tagRoutes);
  app.use('/api/v1/import', importRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/notification-rules', notificationRulesRoutes);
  app.use('/api/v1/admin/notification-rules', adminNotificationRulesRoutes);
  app.use('/api/v1/export', exportRoutes);
  app.use('/api/v1/assessors', assessorRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/webhooks', webhookRoutes);
  app.use('/api/v1/admin/encryption', adminEncryptionRoutes);
  app.use('/api/v1/integrations/chat', chatIntegrationRoutes);
}

// Helper: Configure static file serving and 404 handling
function configureStaticAndErrorRoutes(app: Express): void {
  const config = getConfig();
  if (config.NODE_ENV === 'production') {
    const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(frontendDistPath));
    // SPA fallback: serve index.html for any non-API GET that didn't match
    // a static asset. Uses app.use (no path) because Express 5 /
    // path-to-regexp v8 no longer accepts a bare '*' route pattern.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }
}

// Helper: Configure error handling
function configureErrorHandling(app: Express): void {
  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      method: req.method,
      path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });
}

export function createApp() {
  const app = express();

  // Configure middleware in order
  configureSecurityMiddleware(app);
  configureCORS(app);
  configureRateLimiters(app);
  configureBodyParsing(app);
  configureRequestMiddleware(app);

  // Health check
  app.use('/api/health', healthRoutes);

  // Prometheus metrics endpoint
  app.use('/metrics', metricsRoutes);

  // OpenAPI specification
  app.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(getOpenAPISpec());
  });

  // Setup route
  app.use('/api/v1/setup', setupRoutes);

  // Setup gate
  app.use(requireSetup);

  // Register all API routes
  registerAPIRoutes(app);

  // Configure static files and error routes
  configureStaticAndErrorRoutes(app);

  // Configure error handling
  configureErrorHandling(app);

  return app;
}
