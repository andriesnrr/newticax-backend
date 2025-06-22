// src/app.ts - TypeScript Safe version for Railway deployment
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
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || 4000
});

// Load environment variables
if (!process.env.RAILWAY_ENVIRONMENT) {
  dotenv.config();
}

// Validate environment variables
try {
  validateEnv();
} catch (error) {
  console.error("❌ Environment validation failed:", error);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Create Express app
const app = express();

// Trust proxy for Railway
app.set("trust proxy", true);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for Railway
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

app.use(generalLimiter);

// CORS configuration for Railway + Vercel
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://newticax.vercel.app",
      "https://newticax-frontend.vercel.app",
      "http://localhost:3000",
      "http://localhost:3001",
    ];

    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any Vercel preview domains
    if (origin.includes(".vercel.app")) {
      return callback(null, true);
    }

    // Allow Railway domains
    if (origin.includes(".railway.app")) {
      return callback(null, true);
    }

    // Allow localhost with any port
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
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
  ],
}));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser(env.COOKIE_SECRET));

// Static files
app.use("/uploads", express.static("uploads"));

// API Routes
app.use("/api", routes);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  console.log("🏠 Root endpoint accessed");
  res.json({
    success: true,
    message: "NewticaX API Server - Railway Deployment",
    version: "1.0.0",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    railway: {
      environment: process.env.RAILWAY_ENVIRONMENT || "Not detected",
      url: process.env.RAILWAY_STATIC_URL || "Not available",
      deployment: process.env.RAILWAY_DEPLOYMENT_ID || "Not available",
    },
    endpoints: {
      health: "/health",
      api: "/api",
      docs: "/api/docs",
    },
  });
});

// Health check route - TypeScript Safe
app.get("/health", async (req: Request, res: Response) => {
  console.log("🏥 Health check accessed");
  
  const healthData = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    services: {
      database: false,
    },
  };

  // Quick database check (non-blocking) - TypeScript Safe
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('DB check timeout')), 5000)
    );
    
    const dbHealthResult = await Promise.race([
      checkDBHealth(),
      timeoutPromise
    ]);
    
    // Type guard to ensure we have the right structure
    if (dbHealthResult && typeof dbHealthResult === 'object' && 'connected' in dbHealthResult) {
      healthData.services.database = Boolean(dbHealthResult.connected);
    } else {
      healthData.services.database = false;
    }
  } catch (error) {
    console.log("⚠️ DB health check failed, but continuing");
    healthData.services.database = false;
  }

  // Always return 200 for Railway healthcheck
  res.status(200).json(healthData);
});

// 404 handler
app.use("*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableEndpoints: ["/", "/health", "/api"],
  });
});

// Error handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    console.log("Database connections closed");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start server
const startServer = async () => {
  try {
    console.log("🚀 Starting NewticaX API Server...");
    
    const PORT = env.PORT || 4000;
    
    // Start server first
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Server bound to: 0.0.0.0:${PORT}`);
      console.log(`🚂 Railway URL: ${process.env.RAILWAY_STATIC_URL || "Not set"}`);
      console.log(`📋 Health check: /health`);
      console.log(`🎯 Ready to handle requests!`);
    });

    // Connect to database after server starts (non-blocking)
    connectDB()
      .then(() => {
        console.log("✅ Database connected successfully");
        
        // Initialize admin user (optional, non-blocking)
        import("./services/admin.service").then(({ initializeAdmin }) => {
          initializeAdmin().catch(error => {
            console.warn("⚠️ Admin initialization failed:", error.message);
          });
        }).catch(error => {
          console.warn("⚠️ Admin service import failed:", error.message);
        });
        
        // Start NewsAPI fetcher (optional)
        if (env.NEWS_API_KEY) {
          import("./services/news-api.service").then(({ startNewsAPIFetcher }) => {
            startNewsAPIFetcher();
            console.log("✅ NewsAPI fetcher started");
          }).catch(error => {
            console.warn("⚠️ NewsAPI service failed:", error.message);
          });
        }
      })
      .catch(error => {
        console.error("❌ Database connection failed:", error.message);
        console.log("⚠️ Server running without database connection");
      });

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

export default app;