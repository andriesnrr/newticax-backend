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

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

// Create Express app
const app = express();

// CRITICAL: Trust proxy for Railway deployment
app.set('trust proxy', true);

// Enhanced Security headers for Railway + Vercel
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
  max: 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/',
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
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
  
  if (isAuthEndpoint) {
    console.log(`🔐 AUTH ${req.method} ${req.url} - ${req.ip} [${new Date().toISOString()}]`);
    console.log(`🌐 Origin: ${req.get('Origin') || 'none'}`);
    console.log(`🔑 Auth Header: ${req.get('Authorization') ? 'present' : 'none'}`);
    console.log(`🍪 Cookie: ${req.cookies?.token ? 'present' : 'none'}`);
    console.log(`📋 User-Agent: ${req.get('User-Agent')?.substring(0, 50)}...`);
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (isAuthEndpoint) {
      console.log(`🔐 AUTH ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      
      if (res.statusCode === 200) {
        if (req.url.includes('/login')) {
          console.log(`✅ LOGIN SUCCESS - Cookie will be set`);
        }
      } else if (res.statusCode === 401) {
        console.warn(`⚠️ AUTH FAILED: ${req.url} - Check token presence and validity`);
      }
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
        }
      } else {
        res.setHeader('X-Debug-Success', 'true');
        
        if (req.path.includes('/login')) {
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

// API Routes
app.use('/api', routes);

// Root endpoint with enhanced info
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'NewticaX API Server - Railway Deployment',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    cors: {
      enabled: true,
      credentials: true,
      allowedOrigins: [
        'https://newticax.vercel.app',
        '*.vercel.app',
        'localhost:*'
      ]
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      trustProxy: true,
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
    cors: {
      enabled: true,
      credentials: true,
      origin: req.get('Origin') || 'none'
    },
    request: {
      ip: req.ip,
      userAgent: req.get('User-Agent')?.substring(0, 50),
      origin: req.get('Origin'),
    },
    services: {
      database: false,
      redis: false,
    },
    config: {
      port: env.PORT,
      corsOrigin: env.CORS_ORIGIN,
      frontendUrl: env.FRONTEND_URL,
      hasJwtSecret: !!env.JWT_SECRET,
      hasCookieSecret: !!env.COOKIE_SECRET,
      trustProxy: true,
    },
  };

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

// 404 handler
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

// Connect to database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting NewticaX API Server...');
    console.log('📊 Environment Info:', {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      FRONTEND_URL: env.FRONTEND_URL,
      CORS_ORIGIN: env.CORS_ORIGIN,
      TRUST_PROXY: 'true',
    });

    await connectDB();
    console.log('✅ Database connected successfully');
    
    await initializeAdmin();
    console.log('✅ Admin user initialized');
    
    if (env.NEWS_API_KEY) {
      try {
        startNewsAPIFetcher();
        console.log('✅ NewsAPI fetcher started');
      } catch (error) {
        console.warn('⚠️ Failed to start NewsAPI fetcher:', error);
      }
    }

    const PORT = env.PORT || 4000;
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
      console.log(`🌐 Server URL: http://0.0.0.0:${PORT}`);
      console.log(`🔗 Frontend URL: ${env.FRONTEND_URL}`);
      console.log(`🍪 Cookies: Enabled with credentials support`);
      console.log(`🌍 CORS: Enabled for ${env.CORS_ORIGIN}`);
      console.log(`🎯 Ready to handle requests!`);
    });

    server.timeout = 30000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;