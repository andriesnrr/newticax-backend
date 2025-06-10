// src/utils/rateLimiter.ts - Fixed TypeScript errors
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from './logger';

// Create a store for tracking failed auth attempts
const failedAttempts = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of failedAttempts.entries()) {
    if (now > data.resetTime) {
      failedAttempts.delete(ip);
    }
  }
}, 15 * 60 * 1000);

// Enhanced rate limiter for auth endpoints - FIXED
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request) => {
    // Different limits based on endpoint
    if (req.path === '/api/auth/me') {
      return 30; // More lenient for /me endpoint to prevent frontend loops
    }
    return 5; // Stricter for login/register
  },
  message: (req: Request) => ({
    success: false,
    message: req.path === '/api/auth/me' 
      ? 'Too many authentication checks, please wait a moment.'
      : 'Too many authentication attempts, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(15 * 60), // 15 minutes in seconds
  }),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // FIXED: Changed from function to boolean
  handler: (req: Request, res: Response) => {
    const clientIP = req.ip || 'unknown';
    
    logger.warn('Auth rate limit exceeded', {
      ip: clientIP,
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    // Track failed attempts for additional security
    const attempts = failedAttempts.get(clientIP) || { count: 0, resetTime: 0 };
    if (Date.now() > attempts.resetTime) {
      attempts.count = 1;
      attempts.resetTime = Date.now() + (15 * 60 * 1000);
    } else {
      attempts.count++;
    }
    failedAttempts.set(clientIP, attempts);

    res.status(429).json({
      success: false,
      message: req.path === '/api/auth/me' 
        ? 'Too many authentication checks, please wait a moment.'
        : 'Too many authentication attempts, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

// Specific rate limiter for /me endpoint to prevent loops - FIXED
export const meEndpointRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10, // Max 10 requests per minute per IP
  message: {
    success: false,
    message: 'Too many requests to /me endpoint. Please slow down.',
    code: 'ME_ENDPOINT_RATE_LIMIT',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // FIXED: boolean instead of function
  handler: (req: Request, res: Response) => {
    logger.warn('/me endpoint rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      message: 'Too many requests to authentication endpoint. Please wait before trying again.',
      code: 'ME_ENDPOINT_RATE_LIMIT',
      retryAfter: 60,
      action: 'stop_polling',
    });
  },
});

// General API rate limiter - FIXED
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Much higher for general API usage
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'API_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // FIXED: explicit boolean
  handler: (req: Request, res: Response) => {
    logger.warn('General API rate limit exceeded', {
      ip: req.ip,
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
    });

    res.status(429).json({
      success: false,
      message: 'API rate limit exceeded. Please try again later.',
      code: 'API_RATE_LIMIT',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

// Strict rate limiter for sensitive operations - FIXED
export const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Very strict
  message: {
    success: false,
    message: 'Too many requests for this sensitive operation.',
    code: 'STRICT_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // FIXED: explicit boolean
});

// Progressive rate limiter - FIXED
export const progressiveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request) => {
    const clientIP = req.ip || 'unknown';
    const attempts = failedAttempts.get(clientIP);
    
    if (!attempts || Date.now() > attempts.resetTime) {
      return 20; // Normal limit
    }
    
    // Reduce limit based on previous violations
    if (attempts.count > 5) return 5;
    if (attempts.count > 3) return 10;
    return 15;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // FIXED: explicit boolean
  handler: (req: Request, res: Response) => {
    const clientIP = req.ip || 'unknown';
    const attempts = failedAttempts.get(clientIP);
    
    logger.warn('Progressive rate limit exceeded', {
      ip: clientIP,
      previousViolations: attempts?.count || 0,
      endpoint: req.path,
    });

    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Repeated violations result in stricter limits.',
      code: 'PROGRESSIVE_RATE_LIMIT',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

// Middleware to detect and prevent rapid repeated requests (potential bot)
export const antiSpamMiddleware = (req: Request, res: Response, next: any) => {
  const clientIP = req.ip || 'unknown';
  const key = `${clientIP}-${req.path}`;
  const now = Date.now();
  
  // Simple in-memory tracking (in production, use Redis)
  if (!global.requestTracker) {
    global.requestTracker = new Map();
  }
  
  const tracker = global.requestTracker;
  const history = tracker.get(key) || [];
  
  // Remove requests older than 10 seconds
  const recent = history.filter((timestamp: number) => now - timestamp < 10000);
  
  // If more than 10 requests in 10 seconds to same endpoint, it's likely spam
  if (recent.length >= 10) {
    logger.warn('Potential spam detected', {
      ip: clientIP,
      endpoint: req.path,
      requestsIn10Sec: recent.length,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(429).json({
      success: false,
      message: 'Suspicious activity detected. Please wait before making more requests.',
      code: 'ANTI_SPAM_TRIGGERED',
      retryAfter: 60,
    });
  }
  
  // Add current request to history
  recent.push(now);
  tracker.set(key, recent);
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance
    for (const [k, v] of tracker.entries()) {
      const filtered = v.filter((t: number) => now - t < 60000); // Keep last minute
      if (filtered.length === 0) {
        tracker.delete(k);
      } else {
        tracker.set(k, filtered);
      }
    }
  }
  
  next();
};

// Export function to get failed attempts (for monitoring)
export const getFailedAttempts = (ip: string) => {
  return failedAttempts.get(ip);
};

// Export function to clear failed attempts (for admin)
export const clearFailedAttempts = (ip?: string) => {
  if (ip) {
    failedAttempts.delete(ip);
  } else {
    failedAttempts.clear();
  }
};