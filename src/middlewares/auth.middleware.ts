// src/middlewares/auth.middleware.ts
import { Response, NextFunction, RequestHandler } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { verifyToken, isTokenBlacklisted } from '../utils/jwt';
import { AuthRequest, User } from '../types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Enhanced middleware to protect routes requiring authentication
export const protect: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    let token: string | undefined;

    // Debug logging
    console.log('🛡️ Auth middleware called:', {
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      hasCookie: !!req.cookies?.token,
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 50),
    });

    // Get token from header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔑 Token from Authorization header');
    } else if (req.cookies?.token) {
      token = req.cookies.token;
      console.log('🍪 Token from cookie');
    }

    if (!token) {
      // Add specific headers to prevent frontend loops
      res.setHeader('X-Auth-Required', 'true');
      res.setHeader('X-Auth-Status', 'no_token');
      res.setHeader('X-Clear-Token', 'true');
      
      console.log('❌ No token found');
      
      logger.warn('Auth middleware: No token provided', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      return next(new AppError('Authentication required. Please log in to access this resource.', 401));
    }

    // Check if token is blacklisted
    if (isTokenBlacklisted(token)) {
      console.log('❌ Token is blacklisted');
      
      // Clear blacklisted token cookie
      res.clearCookie('token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-Auth-Status', 'blacklisted');
      res.setHeader('X-Clear-Token', 'true');
      
      logger.warn('Auth middleware: Blacklisted token used', {
        path: req.path,
        ip: req.ip,
        tokenPreview: token.substring(0, 20) + '...',
      });
      
      return next(new AppError('Token has been invalidated. Please log in again.', 401));
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      console.log('❌ Invalid token:', {
        hasDecoded: !!decoded,
        hasUserId: !!(decoded?.userId),
      });
      
      // Clear invalid token cookie to prevent loops
      res.clearCookie('token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-Auth-Status', 'invalid_token');
      res.setHeader('X-Auth-Invalid', 'true');
      res.setHeader('X-Clear-Token', 'true');
      
      logger.warn('Auth middleware: Invalid token', {
        path: req.path,
        ip: req.ip,
        tokenPreview: token.substring(0, 20) + '...',
        decoded: !!decoded,
      });
      
      return next(new AppError('Invalid or expired token. Please log in again.', 401));
    }

    console.log('✅ Token verified for user:', decoded.userId);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        preference: true,
        _count: {
          select: {
            articles: true,
            bookmarks: true,
            likes: true,
            comments: true,
          },
        },
      },
    });

    if (!user) {
      console.log('❌ User not found in database:', decoded.userId);
      
      // Clear token for non-existent user to prevent loops
      res.clearCookie('token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-Auth-Status', 'user_not_found');
      res.setHeader('X-User-Not-Found', 'true');
      res.setHeader('X-Clear-Token', 'true');
      
      logger.warn('Auth middleware: User not found in database', {
        userId: decoded.userId,
        path: req.path,
        ip: req.ip,
      });
      
      return next(new AppError('User no longer exists. Please log in again.', 401));
    }

    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Remove password from user object
    const { password, ...userWithoutPassword } = user;

    // Attach user to request
    authReq.user = userWithoutPassword as User;

    // Add success headers
    res.setHeader('X-Auth-Status', 'authenticated');
    res.setHeader('X-User-Valid', 'true');

    logger.debug('Auth middleware: User authenticated', {
      userId: user.id,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    
    // Clear potentially corrupted cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
      path: '/',
    });
    
    res.setHeader('X-Auth-Status', 'error');
    res.setHeader('X-Auth-Error', 'true');
    res.setHeader('X-Clear-Token', 'true');
    
    logger.error('Auth middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      ip: req.ip,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    next(new AppError('Authentication failed. Please log in again.', 401));
  }
};

// Middleware to restrict access to admin only
export const isAdmin: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  
  console.log('🔐 Admin check for user:', {
    userId: authReq.user?.id,
    role: authReq.user?.role,
    path: req.path,
  });
  
  if (!authReq.user) {
    logger.warn('Admin middleware: No authenticated user', {
      path: req.path,
      ip: req.ip,
    });
    return next(new AppError('Authentication required', 401));
  }

  if (authReq.user.role === 'ADMIN') {
    console.log('✅ Admin access granted');
    logger.info('Admin access granted', {
      userId: authReq.user.id,
      path: req.path,
      ip: req.ip,
    });
    next();
  } else {
    console.log('❌ Admin access denied - insufficient role:', authReq.user.role);
    logger.warn('Admin access denied', {
      userId: authReq.user.id,
      role: authReq.user.role,
      path: req.path,
      ip: req.ip,
    });
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied: Admin privileges required',
      code: 'INSUFFICIENT_PRIVILEGES',
    });
  }
};

// Middleware to restrict access to admin or author
export const isAuthor: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  
  console.log('📝 Author check for user:', {
    userId: authReq.user?.id,
    role: authReq.user?.role,
    path: req.path,
  });
  
  if (!authReq.user) {
    logger.warn('Author middleware: No authenticated user', {
      path: req.path,
      ip: req.ip,
    });
    return next(new AppError('Authentication required', 401));
  }

  if (authReq.user.role === 'ADMIN' || authReq.user.role === 'AUTHOR') {
    console.log('✅ Author access granted');
    logger.info('Author access granted', {
      userId: authReq.user.id,
      role: authReq.user.role,
      path: req.path,
      ip: req.ip,
    });
    next();
  } else {
    console.log('❌ Author access denied - insufficient role:', authReq.user.role);
    logger.warn('Author access denied', {
      userId: authReq.user.id,
      role: authReq.user.role,
      path: req.path,
      ip: req.ip,
    });
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied: Author or Admin privileges required',
      code: 'INSUFFICIENT_PRIVILEGES',
    });
  }
};

// Middleware to check if user owns a resource
export const isOwner = (modelName: string): RequestHandler => { 
  return async (req, res, next) => {
    const authReq = req as AuthRequest;
    
    console.log('👤 Owner check:', {
      userId: authReq.user?.id,
      modelName,
      resourceId: req.params.id,
      path: req.path,
    });
    
    try {
      if (!authReq.user) {
        logger.warn('Owner middleware: No authenticated user', {
          modelName,
          resourceId: req.params.id,
          path: req.path,
          ip: req.ip,
        });
        return next(new AppError('User not authenticated', 401));
      }

      const resourceId = req.params.id;
      if (!resourceId) {
        logger.warn('Owner middleware: No resource ID provided', {
          modelName,
          path: req.path,
          userId: authReq.user.id,
        });
        return next(new AppError('Resource ID not provided in parameters', 400));
      }

      // Use dynamic model access with type assertion
      const resource = await (prisma as any)[modelName].findUnique({
        where: { id: resourceId },
      });

      if (!resource) {
        const capitalizedModelName = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        logger.warn('Owner middleware: Resource not found', {
          modelName,
          resourceId,
          userId: authReq.user.id,
        });
        return next(new AppError(`${capitalizedModelName} not found`, 404));
      }

      const ownerField = resource.authorId || resource.userId;

      if (ownerField !== authReq.user.id && authReq.user.role !== 'ADMIN') {
        console.log('❌ Owner access denied:', {
          resourceOwner: ownerField,
          currentUser: authReq.user.id,
          userRole: authReq.user.role,
        });
        
        logger.warn('Owner access denied', {
          modelName,
          resourceId,
          resourceOwner: ownerField,
          currentUser: authReq.user.id,
          userRole: authReq.user.role,
        });
        
        return next(new AppError(`Not authorized to access or modify this ${modelName}`, 403));
      }

      console.log('✅ Owner access granted');
      logger.info('Owner access granted', {
        modelName,
        resourceId,
        userId: authReq.user.id,
        role: authReq.user.role,
      });

      next();
    } catch (error) {
      logger.error('Owner middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName,
        resourceId: req.params.id,
        userId: authReq.user?.id,
      });
      next(error);
    }
  };
};

// Optional middleware - checks auth but doesn't require it
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    let token: string | undefined;

    console.log('🔓 Optional auth check:', {
      path: req.path,
      hasAuthHeader: !!req.headers.authorization,
      hasCookie: !!req.cookies?.token,
    });

    // Get token from header or cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (token && !isTokenBlacklisted(token)) {
      // Verify token
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        // Get user from database
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            preference: true,
            _count: {
              select: {
                articles: true,
                bookmarks: true,
                likes: true,
                comments: true,
              },
            },
          },
        });

        if (user) {
          // Remove password from user object
          const { password, ...userWithoutPassword } = user;
          authReq.user = userWithoutPassword as User;
          
          console.log('✅ Optional auth: User authenticated:', user.id);
          res.setHeader('X-Auth-Status', 'authenticated');
        } else {
          console.log('⚠️ Optional auth: User not found for token');
          res.setHeader('X-Auth-Status', 'user_not_found');
        }
      } else {
        console.log('⚠️ Optional auth: Invalid token');
        res.setHeader('X-Auth-Status', 'invalid_token');
      }
    } else {
      console.log('⚠️ Optional auth: No valid token');
      res.setHeader('X-Auth-Status', 'no_token');
    }

    // Continue regardless of auth status
    next();
  } catch (error) {
    // If optional auth fails, continue without user
    console.warn('⚠️ Optional auth failed, continuing without user:', error);
    logger.warn('Optional auth failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      ip: req.ip,
    });
    next();
  }
};

// Enhanced middleware specifically for /me endpoint to prevent loops
export const protectMeEndpoint: RequestHandler = async (req, res, next) => {
  console.log('🔍 /me endpoint protection called');
  
  // Use the regular protect middleware but with enhanced error handling
  return protect(req, res, (error) => {
    if (error) {
      // Add specific headers for /me endpoint
      res.setHeader('X-Me-Endpoint', 'true');
      res.setHeader('X-Auth-Failed', 'true');
      
      // If it's an auth error, provide more specific guidance
      if (error.statusCode === 401) {
        console.log('❌ /me endpoint auth failed, providing specific guidance');
        
        return res.status(401).json({
          success: false,
          message: 'Authentication required for user profile',
          code: 'ME_AUTH_REQUIRED',
          action: 'redirect_to_login',
          endpoint: '/me',
          debug: {
            timestamp: new Date().toISOString(),
            suggestion: 'Check if user is logged in before calling /me',
          }
        });
      }
    }
    next(error);
  });
};