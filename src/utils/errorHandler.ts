import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { env } from '../config/env';

// Custom AppError class
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Enhanced error handler with better Railway support
export const errorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  
  // Log error for debugging
  const errorInfo = {
    name: err.name,
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  };

  console.error('🚨 ERROR:', errorInfo);
  
  if (env.NODE_ENV === 'development') {
    console.error('📍 STACK:', err.stack);
  }

  // Handle specific Prisma/MongoDB errors
  if (err.code) {
    // Prisma unique constraint violation
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || ['field'];
      const field = target.join(', ');
      res.status(400).json({
        success: false,
        message: `A record with this ${field} already exists. Please use a different value.`,
        code: 'DUPLICATE_FIELD',
      });
      return;
    }
    
    // Prisma record not found
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: err.meta?.cause || 'The requested record was not found.',
        code: 'RECORD_NOT_FOUND',
      });
      return;
    }

    // Prisma foreign key constraint failed
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Referenced record does not exist.',
        code: 'FOREIGN_KEY_CONSTRAINT',
      });
      return;
    }

    // MongoDB connection errors
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      res.status(503).json({
        success: false,
        message: 'Database connection failed. Please try again later.',
        code: 'DATABASE_CONNECTION_ERROR',
      });
      return;
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
      code: 'INVALID_TOKEN',
    });
    return;
  }
  
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Your token has expired. Please log in again.',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors || err.message,
    });
    return;
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    let message = 'File upload error';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Too many files';
    }
    
    res.status(400).json({
      success: false,
      message,
      code: err.code,
    });
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        message: err.message,
        code: 'APP_ERROR',
      });
    } else {
      console.error('🔥 PROGRAMMING ERROR:', err);
      res.status(500).json({
        success: false,
        message: 'Something went very wrong on the server!',
        code: 'INTERNAL_ERROR',
      });
    }
    return;
  }
  
  // Handle JSON parsing errors
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON format in request body.',
      code: 'INVALID_JSON',
    });
    return;
  }

  // Handle MongoDB/Mongoose errors
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    res.status(500).json({
      success: false,
      message: 'Database operation failed.',
      code: 'DATABASE_ERROR',
    });
    return;
  }

  // Handle CORS errors
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      success: false,
      message: 'Cross-origin request blocked.',
      code: 'CORS_ERROR',
    });
    return;
  }

  // Handle rate limiting errors
  if (err.status === 429) {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }

  // Default error handling
  const finalStatusCode = (err as any).status || (err as any).statusCode || 500;
  const finalMessage = err.message || 'Internal Server Error';
  
  // Don't expose sensitive error details in production
  const responseMessage = env.NODE_ENV === 'production' && finalStatusCode === 500
    ? 'Internal Server Error'
    : finalMessage;

  res.status(finalStatusCode).json({
    success: false,
    message: responseMessage,
    code: 'UNKNOWN_ERROR',
    ...(env.NODE_ENV === 'development' ? { 
      stack: err.stack, 
      errorName: err.name,
      originalError: err,
    } : {}),
  });
};

// 404 error handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// Async error wrapper
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};