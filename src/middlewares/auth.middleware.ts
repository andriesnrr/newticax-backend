import { Response, NextFunction, RequestHandler } from 'express'; // Impor RequestHandler
import passport from 'passport';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
// Impor AuthRequest, User, dan Role dari types/index.ts.
// Pastikan 'User' di types/index.ts adalah alias dari PrismaClientUser yang lengkap.
import { AuthRequest, User, Role as AppRole } from '../types'; 

// Middleware to protect routes requiring authentication
// Kita akan mengetik 'protect' sebagai RequestHandler secara eksplisit
export const protect: RequestHandler = (req, res, next) => {
  // Karena kita mengetik sebagai RequestHandler, req di sini adalah Request biasa.
  // Kita akan melakukan cast ke AuthRequest di dalam callback setelah user diautentikasi.
  const authReq = req as AuthRequest;

  const callback = (err: any, userFromPassport: User | false | null, info: any): void => {
    if (err) {
      return next(err);
    }
    if (!userFromPassport) {
      const message = info?.message || 'Authentication failed. Please log in to access this resource.';
      return next(new AppError(message, 401));
    }
    // Tetapkan user ke authReq.user (yang sudah diketik sebagai AuthRequest)
    authReq.user = userFromPassport as User; 
    next();
  };
  passport.authenticate('jwt', { session: false }, callback)(authReq, res, next);
};

// Middleware to restrict access to admin only
// Ketik sebagai RequestHandler, lalu cast req ke AuthRequest di dalamnya
export const isAdmin: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  if (authReq.user && authReq.user.role === AppRole.ADMIN) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
  }
};

// Middleware to restrict access to admin or author
export const isAuthor: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  if (authReq.user && (authReq.user.role === AppRole.ADMIN || authReq.user.role === AppRole.AUTHOR)) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied: Author or Admin privileges required' });
  }
};

// Middleware to check if user owns a resource
export const isOwner = (modelNameInput: keyof typeof prisma): RequestHandler => { 
  return async (req, res, next) => { // req di sini adalah Request biasa
    const authReq = req as AuthRequest;
    try {
      if (!authReq.user) {
        next(new AppError('User not authenticated', 401));
        return;
      }

      const resourceId = authReq.params.id;
      if (!resourceId) {
        next(new AppError('Resource ID not provided in parameters', 400));
        return;
      }

      const modelName: string = String(modelNameInput); 
      const capitalizedModelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);

      const resource = await (prisma as any)[modelName].findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        next(new AppError(`${capitalizedModelName} not found`, 404));
        return;
      }

      const ownerField = resource.authorId || resource.userId;

      if (ownerField !== authReq.user.id && authReq.user.role !== AppRole.ADMIN) {
        next(new AppError(`Not authorized to access or modify this ${modelName}`, 403));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
