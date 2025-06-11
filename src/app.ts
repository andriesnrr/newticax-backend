// ===== src/app.ts - COMPLETELY FIXED VERSION FOR RAILWAY =====
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB, prisma } from './config/db';
import { env, validateEnv } from './config/env';
import routes from './routes';
import { errorHandler } from './utils/errorHandler';
import { startNewsAPIFetcher } from './services/news-api.service';
import { initializeAdmin } from './services/admin.service';
import { logger } from './utils/logger';

console.log('🚀 Starting NewticaX API...');

// Declare global types for loop prevention
declare global {
  namespace NodeJS {
    interface Global {
      clientPatterns: Map<string, {
        lastRequest: number;
        requestCount: number;
        consecutiveFailures: number;
        blocked: boolean;
        blockUntil: number;
      }>;
    }
  }
  var clientPatterns: Map<string, {
    lastRequest: number;
    requestCount: number;
    consecutiveFailures: number;
    blocked: boolean;
    blockUntil: number;
  }>;
}

// Handle uncaught exceptions early
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
  process.exit(1);
});

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

// Create Express app
const app = express();

// Trust proxy for Railway/Vercel deployment
app.set('trust proxy', 1);

// Security headers - optimized for Railway
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting configurations
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Generous limit for general API usage
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and root
    return req.path === '/health' || req.path === '/';
  }
});

// Special rate limiter for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased from 30 to 50 for better UX
  message: {
    success: false,
    message: 'Too many authentication requests, please wait a moment.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(15 * 60),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response) => {
    const clientIP = req.ip || 'unknown';
    
    logger.warn('Auth rate limit exceeded', {
      ip: clientIP,
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      message: 'Too many authentication requests, please wait a moment.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(15 * 60),
      hint: 'If you are experiencing loops, please check your frontend authentication logic',
      debug: {
        endpoint: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      }
    });
  },
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// CORS configuration - ENHANCED FOR RAILWAY
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://newticax.vercel.app',
      'https://newticax-frontend.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    ];
    
    // Allow any Railway or Vercel preview domains
    if (origin.includes('.railway.app') || 
        origin.includes('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: Must be true for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', // CRITICAL for Bearer tokens
    'X-Requested-With', 
    'Accept', 
    'Origin', 
    'Cookie',
    'Set-Cookie',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: [
    'X-Total-Count', 
    'X-Cache-Status', 
    'X-Auth-Status', 
    'X-Debug-Hint', 
    'X-Clear-Token',
    'Set-Cookie',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset'
  ],
  maxAge: 86400, // 24 hours preflight cache
}));

// Enhanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const isAuthEndpoint = req.url.startsWith('/api/auth/');
  const isMeEndpoint = req.path === '/api/auth/me';
  
  if (isAuthEndpoint) {
    console.log(`🔐 AUTH ${req.method} ${req.url} - ${req.ip} [${new Date().toISOString()}]`);
    console.log(`🌐 Origin: ${req.get('Origin') || 'none'}`);
    console.log(`🔑 Auth Header: ${req.get('Authorization') ? 'present' : 'none'}`);
    console.log(`🍪 Cookie: ${req.cookies?.token ? 'present' : 'none'}`);
    
    if (isMeEndpoint) {
      console.log(`🔍 /me endpoint called - checking for auth loops`);
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (isAuthEndpoint) {
      console.log(`🔐 AUTH ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      
      if (res.statusCode === 200) {
        if (req.url.includes('/login')) {
          console.log(`✅ LOGIN SUCCESS - Cookie set: ${res.headersSent ? 'yes' : 'no'}`);
        } else if (isMeEndpoint) {
          console.log(`✅ /me SUCCESS - User authenticated`);
        }
      } else if (res.statusCode === 401) {
        console.warn(`⚠️ AUTH FAILED: ${req.url} - Check token presence and validity`);
        if (isMeEndpoint) {
          console.warn(`⚠️ /me endpoint returned 401 - this might cause frontend loops`);
        }
      } else if (res.statusCode === 429) {
        console.warn(`🚫 RATE LIMITED: ${req.url} - ${req.ip}`);
      }
    } else if (duration > 2000) {
      console.log(`SLOW: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });
  
  next();
});

// Handle preflight requests explicitly
app.options('*', cors());

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000
}));

// Cookie parser with secret
app.use(cookieParser(env.COOKIE_SECRET));

// NO PASSPORT - JWT ONLY AUTHENTICATION
console.log('ℹ️ Using JWT-only authentication (Passport disabled for Railway)');

// FIXED: Loop prevention middleware with proper typing
const loopPreventionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || 'unknown';
  const now = Date.now();
  const isMeEndpoint = req.path === '/api/auth/me';
  
  // Only apply to /me endpoint to prevent auth loops
  if (!isMeEndpoint) {
    return next();
  }

  // Initialize tracking if needed
  if (!global.clientPatterns) {
    global.clientPatterns = new Map();
  }

  let pattern = global.clientPatterns.get(clientIP);
  
  if (!pattern) {
    pattern = {
      lastRequest: now,
      requestCount: 1,
      consecutiveFailures: 0,
      blocked: false,
      blockUntil: 0,
    };
    global.clientPatterns.set(clientIP, pattern);
    return next();
  }

  // Check if client is currently blocked
  if (pattern.blocked && now < pattern.blockUntil) {
    logger.warn('Blocked client attempting /me request', {
      ip: clientIP,
      endpoint: req.path,
      blockTimeRemaining: pattern.blockUntil - now,
      userAgent: req.get('User-Agent'),
    });

    return res.status(429).json({
      success: false,
      message: 'Client temporarily blocked due to excessive /me requests. Please wait before trying again.',
      code: 'CLIENT_BLOCKED',
      retryAfter: Math.ceil((pattern.blockUntil - now) / 1000),
      action: 'stop_requests',
      hint: 'Check your frontend for infinite loops calling /me endpoint'
    });
  }

  // Reset block if time has passed
  if (pattern.blocked && now >= pattern.blockUntil) {
    pattern.blocked = false;
    pattern.blockUntil = 0;
    pattern.consecutiveFailures = 0;
    pattern.requestCount = 0;
    logger.info('Client unblocked', { ip: clientIP });
  }

  const timeSinceLastRequest = now - pattern.lastRequest;
  
  // If requests are too frequent (less than 500ms apart), it's likely a loop
  if (timeSinceLastRequest < 500) {
    pattern.requestCount++;
    
    // If more than 8 rapid requests, start blocking
    if (pattern.requestCount > 8) {
      pattern.blocked = true;
      pattern.blockUntil = now + (60 * 1000); // Block for 1 minute
      
      logger.warn('Client blocked due to rapid /me requests', {
        ip: clientIP,
        endpoint: req.path,
        requestCount: pattern.requestCount,
        timeSinceLastRequest,
        userAgent: req.get('User-Agent'),
      });

      return res.status(429).json({
        success: false,
        message: 'Too many rapid /me requests detected. This looks like an infinite loop. Please check your frontend code.',
        code: 'RAPID_ME_REQUESTS_DETECTED',
        retryAfter: 60,
        action: 'check_frontend_loop',
        hint: 'Make sure your frontend is not automatically retrying failed /me requests in a loop',
        debug: {
          requestCount: pattern.requestCount,
          timeSinceLastRequest,
          endpoint: req.path,
        }
      });
    }
  } else if (timeSinceLastRequest > 2000) {
    // Reset counter if requests are spaced out properly (2+ seconds)
    pattern.requestCount = 1;
    pattern.consecutiveFailures = 0;
  }

  pattern.lastRequest = now;
  next();
};

// FIXED: Auth debug headers middleware
const authDebugHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Only for auth endpoints
  if (req.path.startsWith('/api/auth/')) {
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      res.setHeader('X-Debug-Endpoint', req.path);
      res.setHeader('X-Debug-Method', req.method);
      res.setHeader('X-Debug-Timestamp', new Date().toISOString());
      res.setHeader('X-Debug-IP', req.ip || 'unknown');
      
      if (res.statusCode >= 400) {
        res.setHeader('X-Debug-Error', 'true');
        res.setHeader('X-Debug-Status', res.statusCode.toString());
        
        if (res.statusCode === 401) {
          res.setHeader('X-Debug-Hint', 'Authentication required - check token validity');
          res.setHeader('X-Clear-Token', 'true');
        } else if (res.statusCode === 429) {
          res.setHeader('X-Debug-Hint', 'Rate limit exceeded - slow down requests');
        }
      } else {
        res.setHeader('X-Debug-Success', 'true');
        
        if (req.path.includes('/login') || req.path.includes('/register')) {
          res.setHeader('X-Debug-Auth-Token', 'set');
        }
      }
      
      return originalJson(data);
    };
  }
  
  next();
};

// Apply middleware
app.use(authDebugHeaders);
app.use(loopPreventionMiddleware);

// Apply auth rate limiting to auth routes only
app.use('/api/auth', authRateLimiter);

// Static files middleware (for uploads)
app.use('/uploads', express.static('uploads', {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Add CORS headers for uploaded files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// API Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'NewticaX API Server - Railway Deployment',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      }
    },
    endpoints: {
      health: '/health',
      api: '/api',
      docs: '/api/docs',
      auth: '/api/auth',
    },
    features: {
      auth: 'JWT-only (Passport disabled)',
      antiLoop: 'Active for /me endpoint',
      rateLimiting: 'Active',
      cors: 'Configured for cross-origin',
    },
  });
});

// Enhanced Health check route
app.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    platform: process.platform,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    services: {
      database: false,
      redis: false,
      email: false,
    },
    loopPrevention: {
      active: true,
      trackedClients: global.clientPatterns ? global.clientPatterns.size : 0,
    },
    config: {
      port: env.PORT,
      corsOrigin: env.CORS_ORIGIN,
      hasJwtSecret: !!env.JWT_SECRET,
      hasCookieSecret: !!env.COOKIE_SECRET,
      hasDatabaseUrl: !!env.DATABASE_URL,
      hasNewsApiKey: !!env.NEWS_API_KEY,
      authMode: 'JWT-only',
    },
  };

  // Test database connection
  try {
    await prisma.user.count();
    healthData.services.database = true;
  } catch (error) {
    healthData.status = 'degraded';
    console.error(`❌ Database health check failed:`, error);
  }

  const totalDuration = Date.now() - startTime;
  (healthData as any).duration = totalDuration;

  const statusCode = healthData.status === 'ok' ? 200 : 503;
  
  res.status(statusCode).json(healthData);
});

// API documentation endpoint
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'NewticaX API Documentation',
    version: '1.0.0',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    authentication: 'JWT Bearer Token or Cookie',
    note: 'OAuth/Social login disabled for Railway deployment',
    features: {
      loopPrevention: 'Active - prevents frontend authentication loops on /me endpoint',
      rateLimiting: 'Active - prevents API abuse',
      debugging: 'Headers provided for frontend debugging',
      cors: 'Configured for cross-origin requests with credentials',
    },
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        profile: 'PUT /api/auth/profile',
        password: 'PUT /api/auth/password',
        preferences: 'PUT /api/auth/preferences',
      },
      articles: {
        list: 'GET /api/articles',
        get: 'GET /api/articles/:slug',
        create: 'POST /api/articles',
        trending: 'GET /api/articles/trending',
        breaking: 'GET /api/articles/breaking',
        search: 'GET /api/articles/search',
      },
      admin: {
        dashboard: 'GET /api/admin/dashboard',
        users: 'GET /api/admin/users',
        categories: 'GET /api/admin/categories',
      }
    },
    troubleshooting: {
      authLoops: 'If experiencing auth loops, check X-Debug-* headers in responses',
      rateLimits: 'Rate limits return specific error codes and retry times',
      debugging: 'Enable browser dev tools to see all response headers',
      cors: 'Ensure frontend is configured for withCredentials: true',
    },
  });
});

// Debug endpoint for monitoring loops and performance
app.get('/api/debug/status', (req: Request, res: Response) => {
  const stats = {
    trackedClients: global.clientPatterns ? global.clientPatterns.size : 0,
    blockedClients: global.clientPatterns ? 
      Array.from(global.clientPatterns.values()).filter((p: any) => p.blocked).length : 0,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  };
  
  res.json({
    success: true,
    data: stats,
  });
});

// 404 handler for all other routes
app.use('*', (req: Request, res: Response) => {
  console.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    suggestion: 'Check the API documentation at /api/docs',
  });
});

// Global error handler middleware
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await prisma.$disconnect();
    console.log('Database connections closed');
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Connect to database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting NewticaX API Server...');
    console.log('📊 Environment Info:', {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      DATABASE_URL: env.DATABASE_URL ? '✅ Set' : '❌ Missing',
      JWT_SECRET: env.JWT_SECRET ? '✅ Set' : '❌ Missing',
      COOKIE_SECRET: env.COOKIE_SECRET ? '✅ Set' : '❌ Missing',
      CORS_ORIGIN: env.CORS_ORIGIN,
      LOOP_PREVENTION: '✅ Active',
      RATE_LIMITING: '✅ Active',
    });

    // Connect to database
    console.log('🔌 Connecting to database...');
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // Initialize admin user if not exists
    console.log('👤 Initializing admin user...');
    await initializeAdmin();
    console.log('✅ Admin user initialized');
    
    // Start the NewsAPI fetcher for background updates (optional)
    if (env.NEWS_API_KEY) {
      try {
        console.log('📰 Starting NewsAPI fetcher...');
        startNewsAPIFetcher();
        console.log('✅ NewsAPI fetcher started');
      } catch (error) {
        console.warn('⚠️ Failed to start NewsAPI fetcher (continuing without it):', error);
      }
    } else {
      console.log('ℹ️ NEWS_API_KEY not found, NewsAPI fetcher not started');
    }

    // Start server
    const PORT = env.PORT || 4000;
    console.log(`🌐 Starting server on port ${PORT}...`);
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
      console.log(`🌐 Server URL: http://0.0.0.0:${PORT}`);
      console.log(`📋 Health check: http://0.0.0.0:${PORT}/health`);
      console.log(`📚 API docs: http://0.0.0.0:${PORT}/api/docs`);
      console.log(`🔐 Auth mode: JWT-only (no Passport)`);
      console.log(`🛡️ Loop prevention: Active for /me endpoint`);
      console.log(`🚦 Rate limiting: Active`);
      console.log(`🌍 CORS: Configured for cross-origin`);
      console.log(`🎯 Ready to handle requests!`);
    });

    // Set server timeout
    server.timeout = 30000; // 30 seconds
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;