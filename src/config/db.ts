import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Create Prisma client with optimized configuration for Railway
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

// Connection retry configuration
const MAX_RETRIES = 10; // Increased for Railway
const RETRY_DELAY = 3000; // 3 seconds
const CONNECTION_TIMEOUT = 10000; // 10 seconds

// Enhanced connection function with retry logic
export const connectDB = async (): Promise<void> => {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`🔌 Database connection attempt ${retries + 1}/${MAX_RETRIES}...`);
      
      // Test the connection with timeout
      const connectionPromise = prisma.$connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      
      // Perform a simple query to ensure the connection is working
      await prisma.user.findFirst({ take: 1 });
      
      console.log('✅ Database connected successfully');
      console.log(`📊 Database URL: ${env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
      
      return;
    } catch (error) {
      retries++;
      console.error(`❌ Database connection attempt ${retries} failed:`, {
        error: error instanceof Error ? error.message : error,
        retries,
        maxRetries: MAX_RETRIES,
      });
      
      if (retries >= MAX_RETRIES) {
        console.error(`❌ Failed to connect to database after ${MAX_RETRIES} attempts`);
        console.error('💡 Please check:');
        console.error('   - DATABASE_URL is correct');
        console.error('   - MongoDB cluster is running');
        console.error('   - Network connectivity');
        console.error('   - Database credentials');
        console.error('   - IP whitelist includes 0.0.0.0/0');
        throw new Error(`Database connection failed after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : error}`);
      }
      
      console.log(`⏳ Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
};

// Enhanced disconnect function
export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Error disconnecting from database:', error);
    throw error;
  }
};

// Database health check with detailed info
export const checkDBHealth = async (): Promise<{
  connected: boolean;
  responseTime?: number;
  error?: string;
}> => {
  const startTime = Date.now();
  
  try {
    // Test with a simple query
    await prisma.user.findFirst({ take: 1 });
    const responseTime = Date.now() - startTime;
    
    console.log(`💚 Database health check: OK (${responseTime}ms)`);
    return {
      connected: true,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`💔 Database health check failed (${responseTime}ms):`, errorMessage);
    return {
      connected: false,
      responseTime,
      error: errorMessage,
    };
  }
};

// Prisma middleware for logging and performance monitoring
prisma.$use(async (params, next) => {
  const start = Date.now();
  
  try {
    const result = await next(params);
    const duration = Date.now() - start;
    
    // Log slow queries in development or if very slow
    if (env.NODE_ENV === 'development' && duration > 1000) {
      console.warn(`🐌 Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
    } else if (duration > 5000) {
      console.error(`🚨 Very slow query: ${params.model}.${params.action} took ${duration}ms`);
    }
    
    // Log all queries in development with their duration
    if (env.NODE_ENV === 'development') {
      console.log(`📝 Query: ${params.model}.${params.action} (${duration}ms)`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`💥 Query failed: ${params.model}.${params.action} (${duration}ms)`, {
      error: error instanceof Error ? error.message : error,
      params: params.args,
    });
    throw error;
  }
});

// Handle uncaught database errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  
  // If it's a database-related error, try to disconnect gracefully
  if (reason instanceof Error && reason.message.includes('prisma')) {
    console.log('🔌 Attempting graceful database disconnect...');
    disconnectDB().finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.log(`📡 Received ${signal}, closing database connections...`);
  try {
    await disconnectDB();
    console.log('👋 Database shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('💥 Error during database shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Database connection status
export const getDBStatus = () => {
  return {
    url: env.DATABASE_URL ? 'configured' : 'not configured',
    client: 'prisma',
    provider: 'mongodb',
  };
};

export default prisma;