import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/security.js';
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
import assessorRoutes from './routes/assessors.js';
import adminRoutes from './routes/admin.js';
import { getOpenAPISpec } from './openapi.js';

export function createApp() {
  const config = getConfig();
  const app = express();

  // Security middleware
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

  // CORS
  app.use(cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key'],
  }));

  // Rate limiting (skip in test environment to avoid flaky tests)
  if (config.NODE_ENV !== 'test') {
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

    app.use(generalLimiter);
    app.use('/api/v1/auth', authLimiter);
  }

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  // Request middleware
  app.use(requestIdMiddleware);
  app.use('/api/v1', camelCaseResponse);

  // Request logging (skip in test to reduce noise)
  if (config.NODE_ENV !== 'test') {
    app.use((req: any, res: Response, next: NextFunction) => {
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

  // Health check
  app.use('/api/health', healthRoutes);

  // OpenAPI specification
  app.get('/api/openapi.json', (req: Request, res: Response) => {
    res.json(getOpenAPISpec());
  });

  // Setup route
  app.use('/api/v1/setup', setupRoutes);

  // Setup gate
  app.use(requireSetup);

  // API routes
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
  app.use('/api/v1/export', exportRoutes);
  app.use('/api/v1/assessors', assessorRoutes);
  app.use('/api/v1/admin', adminRoutes);

  // Production static serving
  if (config.NODE_ENV === 'production') {
    const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(frontendDistPath));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  // Error handling
  app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      method: req.method,
      path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
