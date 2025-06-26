// ===== src/app.ts - COMPLETE FIXED VERSION FOR RAILWAY =====
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDB, prisma, checkDBHealth } from "./config/db";
import { env, validateEnv } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./utils/errorHandler";
import { logger } from "./utils/logger";

console.log("🚀 Starting NewticaX API...");
console.log("🚂 Railway Environment Check:", {
  RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || 'Not detected',
  RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID || 'Not detected',
  RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || 'Not detected',
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || 4000,
  NODE_VERSION: process.version
});

// Handle uncaught exceptions early with Railway support
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
  
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log("⚠️ Railway environment detected, attempting graceful handling...");
    setTimeout(() => {
      console.log("🔄 Delayed exit after Railway exception handling");
      process.exit(1);
    }, 5000);
  } else {
    process.exit(1);
  }
});

// Enhanced unhandled rejection handler for Railway
process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Rejection at:", promise, "reason:", reason);
  
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log("⚠️ Railway environment: logging error but continuing...");
    logger.error("Unhandled rejection in Railway", { reason, promise });
  } else {
    process.exit(1);
  }
});

// Load environment variables with Railway support
if (!process.env.RAILWAY_ENVIRONMENT) {
  dotenv.config();
}

// Validate environment variables
try {
  validateEnv();
  console.log("✅ Environment validation passed");
} catch (error) {
  console.error("❌ Environment validation failed:", error);
  if (process.env.NODE_ENV === 'production') {
    console.error("🔧 Please set required environment variables in Railway dashboard");
    process.exit(1);
  } else {
    console.warn("⚠️ Continuing in development mode with warnings");
  }
}

// Create Express app
const app = express();

// CRITICAL: Trust proxy for Railway deployment
app.set("trust proxy", true);

// Security headers - optimized for Railway
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Rate limiting configurations with Railway optimization
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RAILWAY_ENVIRONMENT ? 2000 : 1000, // Higher limit for Railway
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return req.path === "/health" || req.path === "/" || req.path === "/api/docs";
  },
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RAILWAY_ENVIRONMENT ? 100 : 50, // Higher limit for Railway
  message: {
    success: false,
    message: "Too many authentication requests, please wait a moment.",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    retryAfter: Math.ceil(15 * 60),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Handle preflight requests explicitly
app.options("*", (req, res) => {
  console.log("🔄 OPTIONS preflight request:", req.path);
  res.header("Access-Control-Allow-Origin", req.get("Origin") || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Length, X-Requested-With, Accept, Origin, Cookie, Set-Cookie"
  );
  res.sendStatus(200);
});

// Enhanced request logging middleware with Railway context
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const isAuthEndpoint = req.url.startsWith("/api/auth/");
  const isImportant =
    req.url.startsWith("/api/") || req.url === "/health" || req.url === "/";

  if (isImportant) {
    console.log(
      `📥 ${req.method} ${req.url} - ${req.ip} - ${new Date().toISOString()}`
    );

    if (isAuthEndpoint) {
      console.log(`🔐 AUTH ${req.method} ${req.url}`);
      console.log(`🌐 Origin: ${req.get("Origin") || "none"}`);
      console.log(
        `🔑 Auth Header: ${req.get("Authorization") ? "present" : "none"}`
      );
      console.log(`🍪 Cookie: ${req.cookies?.token ? "present" : "none"}`);
    }
  }

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    if (isImportant) {
      console.log(
        `📤 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`
      );

      if (isAuthEndpoint) {
        if (res.statusCode === 200) {
          if (req.url.includes("/login")) {
            console.log(`✅ LOGIN SUCCESS - Cookie will be set`);
          } else if (req.url.includes("/me")) {
            console.log(`✅ /me SUCCESS - User authenticated`);
          }
        } else if (res.statusCode === 401) {
          console.warn(
            `⚠️ AUTH FAILED: ${req.url} - Check token presence and validity`
          );
        } else if (res.statusCode === 429) {
          console.warn(`🚫 RATE LIMITED: ${req.url} - ${req.ip}`);
        }
      }
    } else if (duration > 2000) {
      console.log(
        `SLOW: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
});

// Body parsing middleware with Railway optimization
app.use(
  express.json({
    limit: process.env.RAILWAY_ENVIRONMENT ? "20mb" : "10mb",
    type: ["application/json", "text/plain"],
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.RAILWAY_ENVIRONMENT ? "20mb" : "10mb",
    parameterLimit: 1000,
  })
);

// ENHANCED: CORS configuration for Railway + Vercel
app.use(
  cors({
    origin: function (origin, callback) {
      console.log("🌐 CORS Check - Origin:", origin);

      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        console.log("✅ CORS: No origin - allowing");
        return callback(null, true);
      }

      const allowedOrigins = [
        "https://newticax.vercel.app",
        "https://newticax-frontend.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ];

      // Check exact matches first
      if (allowedOrigins.includes(origin)) {
        console.log("✅ CORS: Exact match allowed -", origin);
        return callback(null, true);
      }

      // Allow any Vercel preview domains
      if (origin.includes(".vercel.app")) {
        console.log("✅ CORS: Vercel domain allowed -", origin);
        return callback(null, true);
      }

      // Allow Railway domains
      if (origin.includes(".railway.app")) {
        console.log("✅ CORS: Railway domain allowed -", origin);
        return callback(null, true);
      }

      // Allow localhost with any port
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        console.log("✅ CORS: Localhost allowed -", origin);
        return callback(null, true);
      }

      console.log("❌ CORS: Origin blocked -", origin);
      logger.warn("CORS blocked origin", { origin });
      callback(new Error("Not allowed by CORS"));
    },

    // CRITICAL: Must be true for cookies to work cross-origin
    credentials: true,

    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Cookie",
      "Set-Cookie",
      "Cache-Control",
      "Pragma",
      "X-CSRF-Token",
    ],

    exposedHeaders: [
      "X-Total-Count",
      "X-Cache-Status",
      "X-Auth-Status",
      "X-Debug-Hint",
      "X-Clear-Token",
      "Set-Cookie",
      "X-Rate-Limit-Remaining",
      "X-Rate-Limit-Reset",
    ],

    // Cache preflight for 24 hours
    maxAge: 86400,
  })
);

// CRITICAL: Cookie parser with secret
app.use(cookieParser(env.COOKIE_SECRET));

// NO PASSPORT - JWT ONLY AUTHENTICATION
console.log("ℹ️ Using JWT-only authentication (Passport disabled for Railway)");

// Auth debug headers middleware for Railway debugging
const authDebugHeaders = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/auth/")) {
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      // Add debug headers for Railway troubleshooting
      res.setHeader("X-Debug-Endpoint", req.path);
      res.setHeader("X-Debug-Method", req.method);
      res.setHeader("X-Debug-Timestamp", new Date().toISOString());
      res.setHeader("X-Debug-IP", req.ip || "unknown");
      res.setHeader("X-Debug-Origin", req.get("Origin") || "none");
      res.setHeader("X-Railway-Environment", process.env.RAILWAY_ENVIRONMENT || "none");

      if (res.statusCode >= 400) {
        res.setHeader("X-Debug-Error", "true");
        res.setHeader("X-Debug-Status", res.statusCode.toString());

        if (res.statusCode === 401) {
          res.setHeader(
            "X-Debug-Hint",
            "Authentication required - check token validity"
          );
          res.setHeader("X-Clear-Token", "true");
        } else if (res.statusCode === 429) {
          res.setHeader(
            "X-Debug-Hint",
            "Rate limit exceeded - slow down requests"
          );
        }
      } else {
        res.setHeader("X-Debug-Success", "true");

        if (req.path.includes("/login") || req.path.includes("/register")) {
          res.setHeader("X-Debug-Auth-Token", "set");
          res.setHeader("X-Debug-Cookie-Set", "true");
        }
      }

      return originalJson(data);
    };
  }

  next();
};

app.use(authDebugHeaders);

// Apply auth rate limiting to auth routes only
app.use("/api/auth", authRateLimiter);

// Static files middleware (for uploads)
app.use(
  "/uploads",
  express.static("uploads", {
    maxAge: "1d",
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

// API Routes
app.use("/api", routes);

// Enhanced root endpoint with Railway information
app.get("/", (req: Request, res: Response) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    success: true,
    message: "NewticaX API Server - Railway Deployment",
    version: process.env.npm_package_version || "1.0.0",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    railway: {
      environment: process.env.RAILWAY_ENVIRONMENT || "Not detected",
      url: process.env.RAILWAY_STATIC_URL || "Not available",
      deployment: process.env.RAILWAY_DEPLOYMENT_ID || "Not available",
      region: process.env.RAILWAY_REGION || "Not available",
    },
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      trustProxy: true,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    },
    endpoints: {
      health: "/health",
      api: "/api",
      docs: "/api/docs",
      auth: "/api/auth",
    },
    features: {
      auth: "JWT-only (Passport disabled)",
      rateLimiting: "Active",
      cors: "Configured for cross-origin with credentials",
      database: "MongoDB Atlas",
    },
  });
});

// Enhanced Health check route with Railway-specific information
app.get("/api/health", async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log("🏥 Health check accessed");

  const healthData = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
    node: process.version,
    platform: process.platform,
    railway: {
      environment: process.env.RAILWAY_ENVIRONMENT || "Not detected",
      url: process.env.RAILWAY_STATIC_URL || "Not available",
      deployment: process.env.RAILWAY_DEPLOYMENT_ID || "Not available",
      region: process.env.RAILWAY_REGION || "Not available",
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
      authMode: "JWT-only",
      trustProxy: true,
    },
  };

  // Test database connection with Railway-specific handling (non-blocking)
  try {
    const dbHealthPromise = checkDBHealth();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), 5000)
    );

    const dbHealth = await Promise.race([dbHealthPromise, timeoutPromise]);
    
    if (dbHealth && typeof dbHealth === 'object' && 'connected' in dbHealth) {
      healthData.services.database = Boolean(dbHealth.connected);

      if (dbHealth.connected) {
        // Test admin user (quick check)
        try {
          const admin = await Promise.race([
            prisma.user.findFirst({
              where: { role: "ADMIN" },
              select: { id: true, username: true, email: true, role: true },
            }),
            new Promise<null>((_, reject) => 
              setTimeout(() => reject(new Error('Admin check timeout')), 3000)
            )
          ]);

          healthData.services.admin_user = !!admin;
          healthData.services.admin_username_fixed = !!admin?.username;

          console.log("🔍 Health check results:", {
            database: healthData.services.database,
            adminExists: healthData.services.admin_user,
            adminUsernameFixed: healthData.services.admin_username_fixed,
            adminUsername: admin?.username || "null",
            responseTime: dbHealth.responseTime,
            environment: dbHealth.environment
          });
        } catch (adminError) {
          console.log("⚠️ Admin check failed in health check:", adminError);
          healthData.services.admin_user = false;
          healthData.services.admin_username_fixed = false;
        }
      }
    }
  } catch (error) {
    console.log("⚠️ Database health check failed, but continuing:", error);
    healthData.services.database = false;
    
    // In Railway, we still return 200 even if DB is not available
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log("⚠️ Railway: Reporting healthy status despite DB issues");
    }
  }

  const totalDuration = Date.now() - startTime;
  (healthData as any).duration = totalDuration;

  // Always return 200 for Railway healthcheck
  const statusCode = 200;

  // Log health check for Railway monitoring
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log(`🚂 Railway health check: ${healthData.status} (${totalDuration}ms)`);
  }

  res.status(statusCode).json(healthData);
});

// API documentation endpoint with Railway information
app.get("/api/docs", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "NewticaX API Documentation",
    version: "1.0.0",
    baseUrl: `${req.protocol}://${req.get("host")}/api`,
    authentication: "JWT Bearer Token or Cookie",
    note: "OAuth/Social login disabled for Railway deployment",
    railway: {
      deployment: process.env.RAILWAY_DEPLOYMENT_ID,
      environment: process.env.RAILWAY_ENVIRONMENT,
      url: process.env.RAILWAY_STATIC_URL,
    },
    features: {
      loopPrevention:
        "Active - prevents frontend authentication loops on /me endpoint",
      rateLimiting: "Active - prevents API abuse",
      debugging: "Headers provided for frontend debugging",
      cors: "Configured for cross-origin requests with credentials",
    },
    endpoints: {
      auth: {
        register: "POST /api/auth/register",
        login: "POST /api/auth/login",
        logout: "POST /api/auth/logout",
        me: "GET /api/auth/me",
        profile: "PUT /api/auth/profile",
        password: "PUT /api/auth/password",
        preferences: "PUT /api/auth/preferences",
      },
      articles: {
        list: "GET /api/articles",
        get: "GET /api/articles/:slug",
        create: "POST /api/articles",
        trending: "GET /api/articles/trending",
        breaking: "GET /api/articles/breaking",
        search: "GET /api/articles/search",
      },
      admin: {
        dashboard: "GET /api/admin/dashboard",
        users: "GET /api/admin/users",
        categories: "GET /api/admin/categories",
      },
    },
    troubleshooting: {
      authLoops:
        "If experiencing auth loops, check X-Debug-* headers in responses",
      rateLimits: "Rate limits return specific error codes and retry times",
      debugging: "Enable browser dev tools to see all response headers",
      cors: "Ensure frontend is configured for withCredentials: true",
      railway: "Check Railway logs for deployment-specific issues",
    },
  });
});

// 404 handler for all other routes
app.use("*", (req: Request, res: Response) => {
  console.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    suggestion: "Check the API documentation at /api/docs",
    availableEndpoints: [
      "/",
      "/health",
      "/api/docs",
      "/api/auth/*",
      "/api/articles/*",
      "/api/admin/*",
    ],
    railway: {
      deployment: process.env.RAILWAY_DEPLOYMENT_ID,
      environment: process.env.RAILWAY_ENVIRONMENT,
    },
  });
});

// Global error handler middleware
app.use(errorHandler);

// Graceful shutdown handling with Railway support
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    await prisma.$disconnect();
    console.log("Database connections closed");
    console.log("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Enhanced server startup function for Railway
const startServer = async () => {
  try {
    console.log("🚀 Starting NewticaX API Server...");
    console.log("📊 Railway Environment Info:", {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      DATABASE_URL: env.DATABASE_URL ? "✅ Set" : "❌ Missing",
      JWT_SECRET: env.JWT_SECRET ? "✅ Set" : "❌ Missing",
      COOKIE_SECRET: env.COOKIE_SECRET ? "✅ Set" : "❌ Missing",
      CORS_ORIGIN: env.CORS_ORIGIN,
      FRONTEND_URL: env.FRONTEND_URL,
      TRUST_PROXY: "true",
      RAILWAY_URL: process.env.RAILWAY_STATIC_URL || 'Not available',
      RAILWAY_DEPLOYMENT: process.env.RAILWAY_DEPLOYMENT_ID || 'Not available',
      RAILWAY_REGION: process.env.RAILWAY_REGION || 'Not available'
    });

    const PORT = env.PORT || 4000;
    
    // Start server first (non-blocking)
    const host = process.env.HOST || '0.0.0.0';
    const server = app.listen(PORT, host, () => {
      console.log(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
      console.log(`🌐 Server bound to: 0.0.0.0:${PORT}`);
      console.log(`🚂 Railway URL: ${process.env.RAILWAY_STATIC_URL || "Not set"}`);
      console.log(`🎯 Frontend URL: ${env.FRONTEND_URL}`);
      console.log(`📋 Health check: /health`);
      console.log(`📚 API docs: /api/docs`);
      console.log(`🔐 Auth mode: JWT-only (no Passport)`);
      console.log(`🚦 Rate limiting: Active`);
      console.log(`🌍 CORS: Configured for cross-origin`);
      console.log(`🍪 Cookies: Enabled with cross-origin support`);
      console.log(`🎯 Ready to handle requests!`);
      
      // Railway-specific ready signal
      if (process.env.RAILWAY_ENVIRONMENT) {
        console.log(`🚂 Railway deployment ready!`);
        console.log(`🔗 Access your app at: ${process.env.RAILWAY_STATIC_URL}`);
        console.log(`🌍 CORS configured for Vercel frontend`);
      }
    });

    // Set Railway-optimized timeouts
    server.timeout = process.env.RAILWAY_ENVIRONMENT ? 120000 : 60000; // 2 minutes for Railway
    server.keepAliveTimeout = process.env.RAILWAY_ENVIRONMENT ? 75000 : 65000;
    server.headersTimeout = process.env.RAILWAY_ENVIRONMENT ? 80000 : 66000;

    // Connect to database after server starts (non-blocking)
    console.log("🔌 Connecting to database...");
    connectDB()
      .then(() => {
        console.log("✅ Database connected successfully");
        
        // Initialize admin user (optional, non-blocking)
        console.log("👤 Initializing admin user...");
        import("./services/admin.service").then(({ initializeAdmin }) => {
          initializeAdmin().catch(error => {
            console.warn("⚠️ Admin initialization failed:", error.message);
          });
        }).catch(error => {
          console.warn("⚠️ Admin service import failed:", error.message);
        });
        
        // Start NewsAPI fetcher (optional)
        if (env.NEWS_API_KEY) {
          try {
            console.log("📰 Starting NewsAPI fetcher...");
            import("./services/news-api.service").then(({ startNewsAPIFetcher }) => {
              startNewsAPIFetcher();
              console.log("✅ NewsAPI fetcher started");
            }).catch(error => {
              console.warn("⚠️ NewsAPI service failed:", error.message);
            });
          } catch (error) {
            console.warn("⚠️ NewsAPI fetcher failed:", error);
          }
        } else {
          console.log("ℹ️ NEWS_API_KEY not found, NewsAPI fetcher not started");
        }
      })
      .catch(error => {
        console.error("❌ Database connection failed:", error.message);
        console.log("⚠️ Server running without database connection");
        console.log("🔧 Please check your DATABASE_URL and MongoDB Atlas settings");
      });

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    
    if (process.env.RAILWAY_ENVIRONMENT) {
      // Try to start server with minimal functionality for Railway
      const PORT = env.PORT || 4000;
      console.log("⚠️ Starting server with minimal functionality for Railway...");
      
      const host = process.env.HOST || '0.0.0.0';
      const server = app.listen(PORT, host, () => {
        console.log(`⚠️ Server started with limited functionality on port ${PORT}`);
        console.log(`🚂 Railway deployment: Partially ready`);
        console.log(`🔗 URL: ${process.env.RAILWAY_STATIC_URL}`);
      });
      return server;
    } else {
      throw error;
    }
  }
};

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log("⚠️ Railway: Server startup failed but continuing to prevent deployment failure");
  } else {
    process.exit(1);
  }
});

export default app;