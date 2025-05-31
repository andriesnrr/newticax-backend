import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = `\n${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create transports array
const transports: winston.transport[] = [
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    level: 'info',
    format: logFormat,
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 5,
    tailable: true,
  }),

  // File transport for error logs only
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: logFormat,
    maxsize: 50 * 1024 * 1024, // 50MB
    maxFiles: 5,
    tailable: true,
  }),

  // File transport for warnings
  new winston.transports.File({
    filename: path.join(logsDir, 'warn.log'),
    level: 'warn',
    format: logFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 3,
    tailable: true,
  }),
];

// Add console transport for development
if (env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      level: 'debug',
      format: consoleFormat,
    })
  );
} else {
  // In production, only log important stuff to console
  transports.push(
    new winston.transports.Console({
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'newticax-api',
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  },
  transports,
  exitOnError: false,
});

// Create specialized loggers for different modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Specialized loggers
export const authLogger = createModuleLogger('auth');
export const dbLogger = createModuleLogger('database');
export const apiLogger = createModuleLogger('api');
export const securityLogger = createModuleLogger('security');
export const adminLogger = createModuleLogger('admin');
export const newsLogger = createModuleLogger('news');

// Logger middleware for Express
export const loggerMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  // Log request
  logger.info('HTTP Request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding: any) {
    const duration = Date.now() - start;
    
    logger.info('HTTP Response', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
    });

    originalEnd.call(res, chunk, encoding);
  };

  next();
};

// Performance logger
export const logPerformance = (operation: string, startTime: number, metadata?: any) => {
  const duration = Date.now() - startTime;
  
  if (duration > 1000) {
    logger.warn('Slow Operation', {
      operation,
      duration: `${duration}ms`,
      ...metadata,
    });
  } else {
    logger.debug('Operation Completed', {
      operation,
      duration: `${duration}ms`,
      ...metadata,
    });
  }
};

// Security event logger
export const logSecurityEvent = (event: string, details: any) => {
  securityLogger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Database operation logger
export const logDatabaseOperation = (operation: string, model: string, duration?: number, metadata?: any) => {
  dbLogger.info('Database Operation', {
    operation,
    model,
    duration: duration ? `${duration}ms` : undefined,
    ...metadata,
  });
};

// Error logger with context
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

// Audit log for admin actions
export const logAdminAction = (action: string, adminId: string, targetId?: string, details?: any) => {
  adminLogger.info('Admin Action', {
    action,
    adminId,
    targetId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Log cleanup function
export const cleanupLogs = () => {
  const logFiles = ['combined.log', 'error.log', 'warn.log'];
  
  logFiles.forEach(file => {
    const filePath = path.join(logsDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > 30) {
        fs.unlinkSync(filePath);
        logger.info('Old log file cleaned up', { file });
      }
    }
  });
};

// Schedule log cleanup (run daily)
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'exceptions.log'),
  })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'rejections.log'),
  })
);

export default logger;