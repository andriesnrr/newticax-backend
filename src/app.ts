import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
// import passport from 'passport'; // DISABLED
// import session from 'express-session'; // DISABLED
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB, prisma } from './config/db';
import { env, validateEnv } from './config/env';
import routes from './routes';
import { errorHandler } from './utils/errorHandler';
// import { setupPassport } from './config/passport'; // DISABLED
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

// Trust proxy for Railway
app.set('trust proxy', 1);

// Security headers - simplified
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Railway
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting - more lenient
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Much higher limit
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and root
    return req.path === '/health' || req.path === '/';
  }
});

app.use(generalLimiter);

// CORS configuration - simplified and permissive
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie'],
  exposedHeaders: ['X-Total-Count', 'X-Cache-Status'],
}));

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

// PASSPORT & SESSION DISABLED FOR RAILWAY
console.log('ℹ️ OAuth/Passport disabled for Railway deployment');

// Request logging middleware - simplified
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Simple logging
  console.log(`${req.method} ${req.url} - ${req.ip}`);

  // Add response time logging
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 2000) { // Only log slow requests
      console.log(`SLOW: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });
  
  next();
});

// Static files middleware (for uploads)
app.use('/uploads', express.static('uploads', {
  maxAge: '1d',
  etag: true,
  lastModified: true,
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
    endpoints: {
      health: '/health',
      api: '/api',
      docs: '/api/docs',
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
    config: {
      port: env.PORT,
      corsOrigin: env.CORS_ORIGIN,
      hasJwtSecret: !!env.JWT_SECRET,
      hasCookieSecret: !!env.COOKIE_SECRET,
      hasDatabaseUrl: !!env.DATABASE_URL,
      hasNewsApiKey: !!env.NEWS_API_KEY,
    },
  };

  // Test database connection
  try {
    await prisma.user.findFirst({ take: 1 });
    healthData.services.database = true;
  } catch (error) {
    healthData.status = 'degraded';
    console.error(`❌ Database health check failed:`, error);
  }

  // Test Redis connection if available (optional)
  try {
    const { getCacheStats } = await import('./utils/cache');
    const cacheStats = await getCacheStats();
    healthData.services.redis = cacheStats.available;
  } catch (error) {
    // Redis is optional
  }

  // Test Email service if configured (optional)
  try {
    const { EmailService } = await import('./services/email.service');
    healthData.services.email = await EmailService.verifyConnection();
  } catch (error) {
    // Email is optional
  }

  const totalDuration = Date.now() - startTime;
  (healthData as any).duration = totalDuration;

  const statusCode = healthData.status === 'ok' ? 200 : 503;
  
  res.status(statusCode).json(healthData);
});

// API documentation endpoint (basic)
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'NewticaX API Documentation',
    version: '1.0.0',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    note: 'OAuth/Social login temporarily disabled for Railway deployment',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
      },
      articles: {
        list: 'GET /api/articles',
        get: 'GET /api/articles/:slug',
        create: 'POST /api/articles',
        update: 'PUT /api/articles/:id',
        delete: 'DELETE /api/articles/:id',
        trending: 'GET /api/articles/trending',
        breaking: 'GET /api/articles/breaking',
        search: 'GET /api/articles/search',
      },
      interactions: {
        bookmark: 'POST /api/interactions/bookmarks/:articleId',
        like: 'POST /api/interactions/likes/:articleId',
        comment: 'POST /api/interactions/comments/:articleId',
        history: 'GET /api/interactions/reading-history',
      },
      admin: {
        dashboard: 'GET /api/admin/dashboard',
        users: 'GET /api/admin/users',
        categories: 'GET /api/admin/categories',
        'sync-news': 'POST /api/admin/sync-news',
      },
    },
  });
});

// Robots.txt
app.get('/robots.txt', (req: Request, res: Response) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Allow: /health
Allow: /api
Allow: /api/*

Disallow: /admin
Disallow: /uploads

Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// Favicon handling
app.get('/favicon.ico', (req: Request, res: Response) => {
  res.status(204).end();
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
  });
});

// Global error handler middleware
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close database connections
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
      console.log(`🎯 Ready to handle requests!`);
    });

    // Set server timeout
    server.timeout = 30000; // 30 seconds

    // Handle server errors
    server.on('error', (error: any) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else if (error.code === 'EACCES') {
        console.error(`❌ Permission denied to bind to port ${PORT}`);
      }
      process.exit(1);
    });

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    
    // Specific error handling
    if (error instanceof Error) {
      if (error.message.includes('DATABASE_URL')) {
        console.error('💡 Please check your DATABASE_URL environment variable');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('💡 Database connection refused. Please check if your database is running');
      } else if (error.message.includes('authentication failed')) {
        console.error('💡 Database authentication failed. Please check your credentials');
      }
    }
    
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;