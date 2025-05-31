import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError } from '../utils/errorHandler';
import { logger, logSecurityEvent } from '../utils/logger';
import { env } from '../config/env';

// IP whitelist for admin access (optional)
const ADMIN_IP_WHITELIST = env.ADMIN_IP_WHITELIST?.split(',') || [];

// Suspicious patterns for detection
const SUSPICIOUS_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /vbscript:/i,
  /onload=/i,
  /onerror=/i,
  /eval\(/i,
  /expression\(/i,
  /url\(/i,
  /\.\.\//,
  /etc\/passwd/i,
  /proc\/self/i,
  /windows\/system32/i,
];

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /('|(\\')|(;)|(\\;)|(union)|(select)|(insert)|(drop)|(delete)|(update)|(create)|(alter)|(exec)|(execute)|(script)|(\/\*)|(\*\/))/i,
  /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
  /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /<iframe[^>]*src/i,
  /<object[^>]*data/i,
  /<embed[^>]*src/i,
  /<link[^>]*href/i,
  /<meta[^>]*http-equiv/i,
  /on\w+\s*=/i,
];

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self';"
  );

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

// Input validation middleware
export const validateInput = (req: Request, res: Response, next: NextFunction) => {
  const checkForSuspiciousContent = (obj: any, path: string = ''): boolean => {
    if (typeof obj === 'string') {
      // Check for suspicious patterns
      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(obj)) {
          logSecurityEvent('Suspicious Pattern Detected', {
            pattern: pattern.toString(),
            content: obj.substring(0, 100),
            path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          return true;
        }
      }

      // Check for SQL injection
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(obj)) {
          logSecurityEvent('SQL Injection Attempt', {
            pattern: pattern.toString(),
            content: obj.substring(0, 100),
            path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          return true;
        }
      }

      // Check for XSS
      for (const pattern of XSS_PATTERNS) {
        if (pattern.test(obj)) {
          logSecurityEvent('XSS Attempt', {
            pattern: pattern.toString(),
            content: obj.substring(0, 100),
            path,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
          return true;
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (checkForSuspiciousContent(value, `${path}.${key}`)) {
          return true;
        }
      }
    }
    return false;
  };

  // Check request body
  if (req.body && checkForSuspiciousContent(req.body, 'body')) {
    throw new AppError('Suspicious content detected in request', 400);
  }

  // Check query parameters
  if (req.query && checkForSuspiciousContent(req.query, 'query')) {
    throw new AppError('Suspicious content detected in query parameters', 400);
  }

  next();
};

// IP whitelist middleware for admin routes
export const adminIPWhitelist = (req: Request, res: Response, next: NextFunction) => {
  if (ADMIN_IP_WHITELIST.length === 0) {
    return next(); // No whitelist configured
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (!clientIP || !ADMIN_IP_WHITELIST.includes(clientIP)) {
    logSecurityEvent('Admin Access from Non-Whitelisted IP', {
      clientIP,
      whitelist: ADMIN_IP_WHITELIST,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
    });
    
    throw new AppError('Access denied from this IP address', 403);
  }

  next();
};

// Rate limiting configurations
export const createRateLimit = (options: {
  windowMs: number;
  max: number;
  message: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      message: options.message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    handler: (req, res) => {
      logSecurityEvent('Rate Limit Exceeded', {
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        limit: options.max,
        window: options.windowMs,
      });
      
      res.status(429).json({
        success: false,
        message: options.message,
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
};

// Specific rate limiters
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

export const apiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later.',
});

export const strictRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 requests per window
  message: 'Rate limit exceeded for this endpoint.',
});

// CSRF protection middleware
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API requests with valid JWT
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    logSecurityEvent('CSRF Token Mismatch', {
      providedToken: token?.substring(0, 10),
      expectedToken: sessionToken?.substring(0, 10),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    });
    
    throw new AppError('Invalid CSRF token', 403);
  }

  next();
};

// File upload security middleware
export const uploadSecurity = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file && !req.files) {
    return next();
  }

  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];
  
  for (const file of files) {
    if (!file) continue;

    // Check file size
    if (file.size > env.MAX_FILE_SIZE) {
      throw new AppError(`File too large. Maximum size is ${env.MAX_FILE_SIZE / (1024 * 1024)}MB`, 400);
    }

    // Check file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new AppError('File type not allowed', 400);
    }

    // Check filename for suspicious content
    const suspiciousFilePatterns = [
      /\.php$/i,
      /\.exe$/i,
      /\.bat$/i,
      /\.cmd$/i,
      /\.com$/i,
      /\.scr$/i,
      /\.vbs$/i,
      /\.js$/i,
      /\.html$/i,
      /\.htm$/i,
    ];

    for (const pattern of suspiciousFilePatterns) {
      if (pattern.test(file.originalname)) {
        logSecurityEvent('Suspicious File Upload Attempt', {
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          ip: req.ip,
        });
        throw new AppError('File type not allowed', 400);
      }
    }

    // Log file upload
    logger.info('File uploaded', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      ip: req.ip,
      userId: (req as any).user?.id,
    });
  }

  next();
};

// Request size limiter
export const requestSizeLimit = (maxSize: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    
    if (contentLength > maxSize) {
      logSecurityEvent('Request Size Exceeded', {
        contentLength,
        maxSize,
        ip: req.ip,
        url: req.originalUrl,
      });
      
      throw new AppError('Request entity too large', 413);
    }
    
    next();
  };
};