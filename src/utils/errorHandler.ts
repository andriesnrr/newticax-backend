import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('ERROR 💥', err);

  // Handle Prisma errors
  if ((err as any).code) {
    // Handle unique constraint violations
    if ((err as any).code === 'P2002') {
      const field = (err as any).meta?.target?.[0] || 'field';
      return res.status(400).json({
        success: false,
        message: `A record with this ${field} already exists`,
      });
    }
    
    // Handle not found errors
    if ((err as any).code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Record not found',
      });
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Your token has expired. Please log in again.',
    });
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // For development, send the error stack
  if (process.env.NODE_ENV === 'development') {
    return res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack,
    });
  }

  // For production, send generic error
  return res.status(500).json({
    success: false,
    message: 'Something went wrong',
  });
};