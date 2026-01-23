// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { validateEnv, env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { logger } from './config/logger';
import { authenticateJWT } from './modules/auth/auth.middleware';
import { apiKeyMiddleware } from './middleware/apiKey';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { validateClientAccess } from './middleware/clientAccess';
import { healthLimiter, apiLimiter, authLimiter, invitationLimiter } from './config/rateLimiter';
import { healthRouter } from './modules/health/health.routes';
import { taxCalendarRouter } from './modules/taxCalendar/taxCalendar.routes';
import { taxRiskControlsRouter } from './modules/taxRiskControls/taxRiskControls.routes';
import { taxRiskMatrixRouter } from './modules/taxRiskMatrix/taxRiskMatrix.routes';
import { taxFunctionRouter } from './modules/taxFunction/taxFunction.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { externalStorageClientRouter } from './modules/externalStorage/externalStorageClient.routes';
import { externalStorageCallbackRouter } from './modules/externalStorage/externalStorageCallback.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import messagesRouter from './modules/messages/messages.routes';

export function createApp() {
  // Env check
  validateEnv();

  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: env.nodeEnv === 'production',
      crossOriginEmbedderPolicy: false, // Allows Swagger UI to work properly
    })
  );

  // CORS config (environment-specific)
  const corsOptions = {
    origin: env.nodeEnv === 'production' 
      ? [env.frontendUrl, ...env.allowedOrigins]
      : '*',
    credentials: true,
    optionsSuccessStatus: 200,
  };

  // Global middleware
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestIdMiddleware); // Add request ID for tracking
  app.use(requestLogger);

  // Public routes (no API key, no auth) with light rate limiting
  app.use('/', healthLimiter, healthRouter);

  // Swagger documentation (dev + staging only)
  if (env.nodeEnv !== 'production') {
    app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customSiteTitle: 'De Bedrijfsfiscalist API Docs',
        customCss: '.swagger-ui .topbar { display: none }',
      })
    );
    logger.info(`📚 API Documentation available at http://localhost:${env.port}/api-docs`);
  }

  // All /api routes require API key and rate limiting
  app.use('/api', apiLimiter);
  app.use('/api', apiKeyMiddleware);

  // Auth routes: /api/auth/* (public - no JWT required for invitation acceptance)
  // Apply auth rate limiter to prevent brute force attacks
  app.use('/api/auth', authLimiter, authRouter);

  // Admin routes: /api/admin/* (requires JWT + admin role)
  // Apply invitation limiter specifically to invitation endpoints
  app.use('/api/admin/users/invite', invitationLimiter);
  app.use('/api/admin', authenticateJWT, adminRouter);

  // Client-scoped routes: require JWT + client access validation
  const clientRouter = express.Router({ mergeParams: true });

  clientRouter.use('/tax/calendar', taxCalendarRouter);
  clientRouter.use('/tax/risk-controls', taxRiskControlsRouter);
  clientRouter.use('/tax/risk-matrix', taxRiskMatrixRouter);
  clientRouter.use('/tax/function', taxFunctionRouter);
  clientRouter.use('/documents', documentsRouter);
  clientRouter.use('/external-storage', externalStorageClientRouter);
  clientRouter.use('/messages', messagesRouter);

  app.use('/api/clients/:clientId', authenticateJWT, validateClientAccess, clientRouter);
  
  // External storage OAuth callback (no client ID in path, no auth required)
  app.use('/api/external-storage', externalStorageCallbackRouter);

  // 404 & error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

