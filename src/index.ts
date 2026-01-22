// src/index.ts
import { createApp } from './app';
import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './config/logger';
import { initializeJobs, stopJobs } from './jobs';

// Only start server if this file is run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  const server = createServer(app);

  server.listen(env.port, () => {
    logger.info(`🚀 Server is running on port ${env.port}`);
    logger.info(`📍 http://localhost:${env.port}`);
    
    // Initialize background jobs after server starts
    initializeJobs();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    stopJobs();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    stopJobs();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
}

