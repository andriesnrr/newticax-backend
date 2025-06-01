import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB, prisma } from './config/db';
import { env, validateEnv } from './config/env';
import routes from './routes';
import { errorHandler } from './utils/errorHandler';
import { setupPassport } from './config/passport';
import { startNewsAPIFetcher } from './services/news-api.service';
import { initializeAdmin } from './services/admin.service';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

// Create Express app
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  skipSuccessfulRequests: true,
});

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use(generalLimiter);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim());
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['X-Total-Count', 'X-Cache-Status'],
}));

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

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

// Session configuration for OAuth
app.use(session({
  secret: env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    maxAge: env.COOKIE_EXPIRES,
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
  },
  name: 'newticax.session',
  rolling: true, // Reset expiry on activity
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Setup Passport strategies
try {
  setupPassport();
  logger.info('Passport strategies initialized');
} catch (error) {
  logger.error('Failed to setup Passport strategies:', error);
}

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
  });

  // Add response time logging
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.url} - ${res.statusCode}`, {
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      ip: req.ip,
    });
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
    message: 'NewticaX API Server',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api',
      docs: '/api/docs', // If you add API documentation
    },
  });
});

// Health check route with detailed information
app.get('/health', async (req: Request, res: Response) => {
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
    services: {
      database: false,
      redis: false,
      email: false,
    },
  };

  try {
    // Test database connection
    await prisma.user.findFirst({ take: 1 });
    healthData.services.database = true;
  } catch (error) {
    logger.error('Database health check failed', error);
    healthData.status = 'degraded';
  }

  // Test Redis connection if available
  try {
    const { getCacheStats } = await import('./utils/cache');
    const cacheStats = await getCacheStats();
    healthData.services.redis = cacheStats.available;
  } catch (error) {
    // Redis is optional, don't fail health check
    logger.debug('Redis health check failed or not configured', error);
  }

  // Test Email service if configured
  try {
    const { EmailService } = await import('./services/email.service');
    healthData.services.email = await EmailService.verifyConnection();
  } catch (error) {
    // Email is optional, don't fail health check
    logger.debug('Email service health check failed or not configured', error);
  }

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
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        'social-google': 'GET /api/auth/google',
        'social-github': 'GET /api/auth/github',
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
${env.NODE_ENV === 'production' ? 'Allow: /' : 'Disallow: /'}
Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// Favicon handling
app.get('/favicon.ico', (req: Request, res: Response) => {
  res.status(204).end();
});

// 404 handler for all other routes
app.use('*', (req: Request, res: Response) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
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
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close database connections
    await prisma.$disconnect();
    logger.info('Database connections closed');
    
    // Close Redis connections if available
    try {
      const { Redis } = await import('ioredis');
      // Close Redis connections if any
    } catch (error) {
      // Redis not configured, ignore
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('Database connected successfully');
    
    // Initialize admin user if not exists
    await initializeAdmin();
    logger.info('Admin user initialized');
    
    // Start the NewsAPI fetcher for background updates
    if (env.NEWS_API_KEY) {
      try {
        startNewsAPIFetcher();
        logger.info('NewsAPI fetcher started');
      } catch (error) {
        logger.warn('Failed to start NewsAPI fetcher:', error);
      }
    } else {
      logger.warn('NEWS_API_KEY not found, NewsAPI fetcher not started');
    }

    // Start server
    const PORT = env.PORT || 4000;
    const server = app.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
      logger.info(`🌐 Server URL: http://localhost:${PORT}`);
      logger.info(`📋 Health check: http://localhost:${PORT}/health`);
      logger.info(`📚 API docs: http://localhost:${PORT}/api/docs`);
    });

    // Set server timeout
    server.timeout = 30000; // 30 seconds

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`);
        logger.info(`Try using a different port: PORT=4001 npm start`);
      } else if (error.code === 'EACCES') {
        logger.error(`❌ Permission denied to bind to port ${PORT}`);
        logger.info(`Try using a port > 1024 or run with sudo (not recommended)`);
      } else {
        logger.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    // Handle server listening
    server.on('listening', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        logger.info(`Server listening on ${addr.address}:${addr.port}`);
      }
    });

    return server;

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    
    // Specific error handling
    if (error instanceof Error) {
      if (error.message.includes('DATABASE_URL')) {
        logger.error('Please check your DATABASE_URL environment variable');
      } else if (error.message.includes('ECONNREFUSED')) {
        logger.error('Database connection refused. Please check if your database is running');
      } else if (error.message.includes('authentication failed')) {
        logger.error('Database authentication failed. Please check your credentials');
      }
    }
    
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;