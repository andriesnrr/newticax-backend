import { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from './logger';

export const asyncHandler = (fn: Function): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    Promise.resolve(fn(req, res, next))
      .then((result) => {
        const duration = Date.now() - startTime;
        if (duration > 5000) { // Log slow operations
          logger.warn('Slow async operation', {
            method: req.method,
            url: req.originalUrl,
            duration: `${duration}ms`,
          });
        }
        return result;
      })
      .catch((error) => {
        const duration = Date.now() - startTime;
        logger.error('Async handler error', {
          error: error.message,
          method: req.method,
          url: req.originalUrl,
          duration: `${duration}ms`,
          stack: error.stack,
        });
        next(error);
      });
  };
};

// Higher-order function for controller methods
export const controllerWrapper = (controllerName: string, methodName: string) => {
  return (fn: Function): RequestHandler => {
    return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      try {
        logger.debug(`${controllerName}.${methodName} started`, {
          method: req.method,
          url: req.originalUrl,
          userId: (req as any).user?.id,
        });

        const result = await fn(req, res, next);
        
        const duration = Date.now() - startTime;
        logger.debug(`${controllerName}.${methodName} completed`, {
          duration: `${duration}ms`,
          method: req.method,
          url: req.originalUrl,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`${controllerName}.${methodName} failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${duration}ms`,
          method: req.method,
          url: req.originalUrl,
          userId: (req as any).user?.id,
        });
        throw error;
      }
    });
  };
};