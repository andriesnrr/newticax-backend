// src/middlewares/auth.middleware.ts
import { Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { verifyToken } from '../utils/jwt';
import { AuthRequest, User } from '../types';

// Middleware to protect routes requiring authentication
export const protect: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    let token: string | undefined;

    // Get token from header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // Add specific header to prevent frontend loops
      res.setHeader('X-Auth-Required', 'true');
      return next(new AppError('Authentication required. Please log in to access this resource.', 401));
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      // Clear invalid token cookie to prevent loops
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-Auth-Invalid', 'true');
      return next(new AppError('Invalid or expired token. Please log in again.', 401));
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        preference: true,
      },
    });

    if (!user) {
      // Clear token for non-existent user to prevent loops
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-User-Not-Found', 'true');
      return next(new AppError('User no longer exists. Please log in again.', 401));
    }

    // Remove password from user object
    const { password, ...userWithoutPassword } = user;

    // Attach user to request
    authReq.user = userWithoutPassword as User;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Clear potentially corrupted cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      path: '/',
    });
    
    res.setHeader('X-Auth-Error', 'true');
    next(new AppError('Authentication failed. Please log in again.', 401));
  }
};

// Middleware to restrict access to admin only
export const isAdmin: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  
  if (!authReq.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (authReq.user.role === 'ADMIN') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied: Admin privileges required' 
    });
  }
};

// Middleware to restrict access to admin or author
export const isAuthor: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  
  if (!authReq.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (authReq.user.role === 'ADMIN' || authReq.user.role === 'AUTHOR') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied: Author or Admin privileges required' 
    });
  }
};

// Middleware to check if user owns a resource
export const isOwner = (modelName: string): RequestHandler => { 
  return async (req, res, next) => {
    const authReq = req as AuthRequest;
    
    try {
      if (!authReq.user) {
        return next(new AppError('User not authenticated', 401));
      }

      const resourceId = authReq.params.id;
      if (!resourceId) {
        return next(new AppError('Resource ID not provided in parameters', 400));
      }

      const capitalizedModelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);

      // Use dynamic model access with type assertion
      const resource = await (prisma as any)[modelName].findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        return next(new AppError(`${capitalizedModelName} not found`, 404));
      }

      const ownerField = resource.authorId || resource.userId;

      if (ownerField !== authReq.user.id && authReq.user.role !== 'ADMIN') {
        return next(new AppError(`Not authorized to access or modify this ${modelName}`, 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Optional middleware - checks auth but doesn't require it
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    let token: string | undefined;

    // Get token from header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (token) {
      // Verify token
      const decoded = verifyToken(token);
      if (decoded) {
        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            preference: true,
          },
        });

        if (user) {
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          authReq.user = userWithoutPassword as User;
        }
      }
    }

    // Continue regardless of auth status
    next();
  } catch (error) {
    // If optional auth fails, continue without user
    console.warn('Optional auth failed:', error);
    next();
  }
};

// Rate limiting middleware for auth endpoints
export const authRateLimit = (req: any, res: any, next: any) => {
  // Add rate limiting logic here if needed
  next();
};