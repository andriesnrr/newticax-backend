import { Response, NextFunction } from 'express';
import passport from 'passport';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { AuthRequest } from '../types';
import { Role } from '@prisma/client';

// Middleware to protect routes requiring authentication
export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return next(new AppError('Please log in to access this resource', 401));
    }

    req.user = user;
    next();
  })(req, res, next);
};

// Middleware to restrict access to admin only
export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== Role.ADMIN) {
    return next(new AppError('Access denied: Admin privileges required', 403));
  }
  next();
};

// Middleware to restrict access to admin or author
export const isAuthor = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== Role.ADMIN && req.user?.role !== Role.AUTHOR) {
    return next(new AppError('Access denied: Author privileges required', 403));
  }
  next();
};

// Middleware to check if user owns a resource
export const isOwner = (resourceName: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new AppError('User not authenticated', 401));
      }

      const resourceId = req.params.id;
      if (!resourceId) {
        return next(new AppError('Resource ID not provided', 400));
      }

      const model = resourceName.charAt(0).toUpperCase() + resourceName.slice(1);
      const resource = await (prisma as any)[resourceName].findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        return next(new AppError(`${model} not found`, 404));
      }

      if (resource.userId !== req.user.id && req.user.role !== Role.ADMIN) {
        return next(new AppError(`Not authorized to access this ${resourceName}`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
