// src/modules/health/health.routes.ts
import { Router, Request, Response } from 'express';
import { createSupabaseAdminClient } from '../../lib/supabaseClient';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import packageJson from '../../../package.json';

export const healthRouter = Router();

/**
 * @openapi
 * /:
 *   get:
 *     summary: API information endpoint
 *     description: Returns basic information about the API
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: De Bedrijfsfiscalist Backend API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 status:
 *                   type: string
 *                   example: running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'De Bedrijfsfiscalist Backend API',
    version: packageJson.version,
    environment: env.nodeEnv,
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API including database connectivity
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   example: 12345.67
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       enum: [healthy, unhealthy, unknown]
 *       503:
 *         description: API is degraded or unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: degraded
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: unhealthy
 */
healthRouter.get('/health', async (_req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.nodeEnv,
    version: packageJson.version,
    checks: {
      database: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
    },
  };

  try {
    // Supabase bağlantı kontrolü
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('app_users').select('id').limit(1);
    health.checks.database = error ? 'unhealthy' : 'healthy';
    
    if (error) {
      health.status = 'degraded';
      logger.error('Health check: database unhealthy', { error });
    }
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
    logger.error('Health check: database connection failed', { error });
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * @openapi
 * /health/live:
 *   get:
 *     summary: Liveness probe endpoint
 *     description: Returns whether the process is running (for Kubernetes/Docker liveness probe)
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Process is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Readiness probe endpoint
 *     description: Returns whether the service is ready to handle traffic (for Kubernetes/Docker readiness probe)
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *       503:
 *         description: Service is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: not_ready
 *                 timestamp:
 *                   type: string
 *                 checks:
 *                   type: object
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const health = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown' as 'healthy' | 'unhealthy' | 'unknown',
    },
  };

  try {
    // Supabase bağlantı kontrolü
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('app_users').select('id').limit(1);
    health.checks.database = error ? 'unhealthy' : 'healthy';
    
    if (error) {
      health.status = 'not_ready';
      logger.error('Readiness check: database unhealthy', { error });
    }
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'not_ready';
    logger.error('Readiness check: database connection failed', { error });
  }

  const statusCode = health.status === 'ready' ? 200 : 503;
  res.status(statusCode).json(health);
});

