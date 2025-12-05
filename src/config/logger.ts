// src/config/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from './env';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transport configurations
const transports: winston.transport[] = [
  // Console output
  new winston.transports.Console({
    format: consoleFormat,
    level: env.nodeEnv === 'development' ? 'debug' : 'info',
  }),
];

// File transports only in production
if (env.nodeEnv === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '14d', // 14 gün sakla
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '30d', // 30 gün sakla
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: env.nodeEnv === 'development' ? 'debug' : 'info',
  transports,
  exitOnError: false,
});

// Log unhandled exceptions and rejections
if (env.nodeEnv === 'production') {
  logger.exceptions.handle(
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    })
  );

  logger.rejections.handle(
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    })
  );
}

