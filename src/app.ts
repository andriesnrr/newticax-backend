// ===== src/app.ts - COMPLETE FIXED VERSION FOR RAILWAY =====
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

// CRITICAL: Trust proxy for Railway deployment
app.set('trust proxy', true);

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
    return req.path === '/health' || req.path === '/';
  }
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased for better UX
  message: {
    success: false,
    message: 'Too many authentication requests, please wait a moment.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(15 * 60),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// FIXED: Enhanced CORS configuration for Railway + Vercel
app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS Check - Origin:', origin);
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      console.log('✅ CORS: No origin - allowing');
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'https://newticax.vercel.app',
      'https://newticax-frontend.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
    ];
    
    // Check exact matches first
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS: Exact match allowed -', origin);
      return callback(null, true);
    }
    
    // Allow any Vercel preview domains
    if (origin.includes('.vercel.app')) {
      console.log('✅ CORS: Vercel domain allowed -', origin);
      return callback(null, true);
    }
    
    // Allow Railway domains
    if (origin.includes('.railway.app')) {
      console.log('✅ CORS: Railway domain allowed -', origin);
      return callback(null, true);
    }
    
    // Allow localhost with any port
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      console.log('✅ CORS: Localhost allowed -', origin);
      return callback(null, true);
    }
    
    console.log('❌ CORS: Origin blocked -', origin);
    logger.warn('CORS blocked origin', { origin });
    callback(new Error('Not allowed by CORS'));
  },
  
  // CRITICAL: Must be true for cookies to work cross-origin
  credentials: true,
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  
  allowedHeaders: [
    'Content-Type', 
    'Authorization',
    'X-Requested-With', 
    'Accept', 
    'Origin', 
    'Cookie',
    'Set-Cookie',
    'Cache-Control',
    'Pragma',
    'X-CSRF-Token'
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
  
  // Cache preflight for 24 hours
  maxAge: 86400,
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  console.log('🔄 OPTIONS preflight request:', req.path);
  res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Accept, Origin, Cookie, Set-Cookie');
  res.sendStatus(200);
});

// Enhanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const isAuthEndpoint = req.url.startsWith('/api/auth/');
  const isImportant = req.url.startsWith('/api/') || req.url === '/health' || req.url === '/';
  
  if (isImportant) {
    console.log(`📥 ${req.method} ${req.url} - ${req.ip} - ${new Date().toISOString()}`);
    
    if (isAuthEndpoint) {
      console.log(`🔐 AUTH ${req.method} ${req.url}`);
      console.log(`🌐 Origin: ${req.get('Origin') || 'none'}`);
      console.log(`🔑 Auth Header: ${req.get('Authorization') ? 'present' : 'none'}`);
      console.log(`🍪 Cookie: ${req.cookies?.token ? 'present' : 'none'}`);
    }
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (isImportant) {
      console.log(`📤 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      
      if (isAuthEndpoint) {
        if (res.statusCode === 200) {
          if (req.url.includes('/login')) {
            console.log(`✅ LOGIN SUCCESS - Cookie will be set`);
          } else if (req.url.includes('/me')) {
            console.log(`✅ /me SUCCESS - User authenticated`);
          }
        } else if (res.statusCode === 401) {
          console.warn(`⚠️ AUTH FAILED: ${req.url} - Check token presence and validity`);
        } else if (res.statusCode === 429) {
          console.warn(`🚫 RATE LIMITED: ${req.url} - ${req.ip}`);
        }
      }
    } else if (duration > 2000) {
      console.log(`SLOW: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });
  
  next();
});

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

// CRITICAL: Cookie parser with secret
app.use(cookieParser(env.COOKIE_SECRET));

// NO PASSPORT - JWT ONLY AUTHENTICATION
console.log('ℹ️ Using JWT-only authentication (Passport disabled for Railway)');

// Auth debug headers middleware
const authDebugHeaders = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/auth/')) {
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      // Add debug headers
      res.setHeader('X-Debug-Endpoint', req.path);
      res.setHeader('X-Debug-Method', req.method);
      res.setHeader('X-Debug-Timestamp', new Date().toISOString());
      res.setHeader('X-Debug-IP', req.ip || 'unknown');
      res.setHeader('X-Debug-Origin', req.get('Origin') || 'none');
      
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
          res.setHeader('X-Debug-Cookie-Set', 'true');
        }
      }
      
      return originalJson(data);
    };
  }
  
  next();
};

app.use(authDebugHeaders);

// Apply auth rate limiting to auth routes only
app.use('/api/auth', authRateLimiter);

// Static files middleware (for uploads)
app.use('/uploads', express.static('uploads', {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// API Routes
app.use('/api', routes);

// Enhanced root endpoint
app.get('/', (req: Request, res: Response) => {
  console.log('🏠 Root endpoint accessed');
  res.json({
    success: true,
    message: 'NewticaX API Server - Railway Deployment',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    railway: {
      url: process.env.RAILWAY_STATIC_URL || 'Not available',
      environment: process.env.RAILWAY_ENVIRONMENT || 'Not available',
      deployment: process.env.RAILWAY_DEPLOYMENT_ID || 'Not available',
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      trustProxy: true,
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
      cors: 'Configured for cross-origin with credentials',
      database: 'MongoDB Atlas',
    },
  });
});

// Enhanced Health check route
app.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('🏥 Health check accessed');
  
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    platform: process.platform,
    railway: {
      url: process.env.RAILWAY_STATIC_URL,
      environment: process.env.RAILWAY_ENVIRONMENT,
      deployment: process.env.RAILWAY_DEPLOYMENT_ID,
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    services: {
      database: false,
      admin_user: false,
      admin_username_fixed: false,
    },
    config: {
      port: env.PORT,
      corsOrigin: env.CORS_ORIGIN,
      frontendUrl: env.FRONTEND_URL,
      hasJwtSecret: !!env.JWT_SECRET,
      hasCookieSecret: !!env.COOKIE_SECRET,
      hasDatabaseUrl: !!env.DATABASE_URL,
      hasNewsApiKey: !!env.NEWS_API_KEY,
      authMode: 'JWT-only',
      trustProxy: true,
    },
  };

  // Test database connection
  try {
    const userCount = await prisma.user.count();
    healthData.services.database = true;

    // Test admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, username: true, email: true, role: true }
    });
    
    healthData.services.admin_user = !!admin;
    healthData.services.admin_username_fixed = !!(admin?.username);

    console.log('🔍 Health check results:', {
      database: healthData.services.database,
      adminExists: healthData.services.admin_user,
      adminUsernameFixed: healthData.services.admin_username_fixed,
      adminUsername: admin?.username || 'null',
      userCount,
    });

  } catch (error) {
    healthData.status = 'degraded';
    console.error('❌ Database health check failed:', error);
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
    railway: {
      deployment: process.env.RAILWAY_DEPLOYMENT_ID,
      environment: process.env.RAILWAY_ENVIRONMENT,
    },
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

// Debug endpoint for monitoring
app.get('/api/debug/status', (req: Request, res: Response) => {
  const stats = {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    railway: {
      url: process.env.RAILWAY_STATIC_URL,
      environment: process.env.RAILWAY_ENVIRONMENT,
      deployment: process.env.RAILWAY_DEPLOYMENT_ID,
    },
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
    availableEndpoints: [
      '/',
      '/health',
      '/api/docs',
      '/api/auth/*',
      '/api/articles/*',
      '/api/admin/*',
    ],
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
      FRONTEND_URL: env.FRONTEND_URL,
      TRUST_PROXY: 'true',
      RAILWAY_URL: process.env.RAILWAY_STATIC_URL,
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

    // Start server - CRITICAL: Bind to 0.0.0.0 for Railway
    const PORT = env.PORT || 4000;
    console.log(`🌐 Starting server on port ${PORT}...`);
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
      console.log(`🌐 Server bound to: 0.0.0.0:${PORT}`);
      console.log(`🔗 Railway URL: ${process.env.RAILWAY_STATIC_URL || 'Not set'}`);
      console.log(`🎯 Frontend URL: ${env.FRONTEND_URL}`);
      console.log(`📋 Health check: /health`);
      console.log(`📚 API docs: /api/docs`);
      console.log(`🔐 Auth mode: JWT-only (no Passport)`);
      console.log(`🛡️ Loop prevention: Active for /me endpoint`);
      console.log(`🚦 Rate limiting: Active`);
      console.log(`🌍 CORS: Configured for cross-origin`);
      console.log(`🍪 Cookies: Enabled with cross-origin support`);
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