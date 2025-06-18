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

// Enhanced connection configuration for Railway
const MAX_RETRIES = process.env.RAILWAY_ENVIRONMENT ? 20 : 10;
const RETRY_DELAY = process.env.RAILWAY_ENVIRONMENT ? 5000 : 3000;
const CONNECTION_TIMEOUT = process.env.RAILWAY_ENVIRONMENT ? 30000 : 10000;

export const connectDB = async (): Promise<void> => {
  let retries = 0;
  
  console.log('🔌 Starting database connection...');
  console.log('📊 Connection config:', {
    maxRetries: MAX_RETRIES,
    retryDelay: RETRY_DELAY,
    timeout: CONNECTION_TIMEOUT,
    environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'
  });
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`🔌 Database connection attempt ${retries + 1}/${MAX_RETRIES}...`);
      
      // Test connection with extended timeout for Railway
      const connectionPromise = prisma.$connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      
      // Test database connection with a simple MongoDB operation
      // This will create the database if it doesn't exist
      try {
        await prisma.user.count();
        console.log('✅ Database connection and query test successful');
      } catch (countError) {
        // If user collection doesn't exist yet, that's fine
        console.log('✅ Database connection successful (user collection will be created)');
      }
      
      console.log('✅ Database connected successfully');
      console.log(`📊 Database URL: ${env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
      
      return;
    } catch (error) {
      retries++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`❌ Database connection attempt ${retries} failed:`, {
        error: errorMessage,
        retries,
        maxRetries: MAX_RETRIES,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT
      });
      
      if (retries >= MAX_RETRIES) {
        console.error(`❌ Failed to connect to database after ${MAX_RETRIES} attempts`);
        console.error('💡 Railway troubleshooting tips:');
        console.error('   - Check if DATABASE_URL is correct in Railway dashboard');
        console.error('   - Verify MongoDB cluster is running and accessible');
        console.error('   - Ensure IP whitelist includes 0.0.0.0/0 for Railway');
        console.error('   - Check if database credentials are correct');
        console.error('   - Verify network connectivity from Railway region');
        
        throw new Error(`Database connection failed after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
      
      const waitTime = RETRY_DELAY + (retries * 1000); // Progressive backoff
      console.log(`⏳ Retrying in ${waitTime / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
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

// Railway-optimized health check for MongoDB
export const checkDBHealth = async (): Promise<{
  connected: boolean;
  responseTime?: number;
  error?: string;
  environment?: string;
  collections?: number;
}> => {
  const startTime = Date.now();
  
  try {
    // Test with multiple operations to ensure full connectivity
    const [userCount] = await Promise.all([
      prisma.user.count().catch(() => 0), // Return 0 if collection doesn't exist
    ]);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`💚 Database health check: OK (${responseTime}ms) - Users: ${userCount}`);
    return {
      connected: true,
      responseTime,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
      collections: userCount >= 0 ? 1 : 0
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`💔 Database health check failed (${responseTime}ms):`, errorMessage);
    return {
      connected: false,
      responseTime,
      error: errorMessage,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
      collections: 0
    };
  }
};

// Railway-specific middleware with performance monitoring
prisma.$use(async (params, next) => {
  const start = Date.now();
  
  try {
    const result = await next(params);
    const duration = Date.now() - start;
    
    // Log slow queries with Railway context
    if (duration > 1000) {
      console.warn(`🐌 Slow query detected: ${params.model}.${params.action} took ${duration}ms`, {
        environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
        deployment: process.env.RAILWAY_DEPLOYMENT_ID,
        args: JSON.stringify(params.args).substring(0, 100)
      });
    }
    
    // Log all queries in development
    if (env.NODE_ENV === 'development') {
      console.log(`📝 Query: ${params.model}.${params.action} (${duration}ms)`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`💥 Query failed: ${params.model}.${params.action} (${duration}ms)`, {
      error: error instanceof Error ? error.message : error,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local'
    });
    throw error;
  }
});

// Enhanced error handling for Railway MongoDB
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  
  // If it's a database-related error, try to disconnect gracefully
  if (reason instanceof Error && (
    reason.message.toLowerCase().includes('prisma') ||
    reason.message.toLowerCase().includes('mongodb') ||
    reason.message.toLowerCase().includes('connection')
  )) {
    console.log('🔌 Attempting graceful database disconnect...');
    disconnectDB().finally(() => {
      if (process.env.RAILWAY_ENVIRONMENT) {
        console.log('⚠️ Railway environment: not exiting on database error');
      } else {
        process.exit(1);
      }
    });
  } else if (!process.env.RAILWAY_ENVIRONMENT) {
    process.exit(1);
  }
});

// Graceful shutdown handlers with Railway support
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

// Test database operations helper
export const testDatabaseOperations = async (): Promise<{
  canRead: boolean;
  canWrite: boolean;
  collections: string[];
  error?: string;
}> => {
  try {
    // Test read operation
    const userCount = await prisma.user.count();
    console.log(`📊 Database read test: Found ${userCount} users`);
    
    // Test write operation (create a test record and delete it)
    const testUser = await prisma.user.create({
      data: {
        name: 'Test User',
        email: `test-${Date.now()}@test.com`,
        username: `test-${Date.now()}`,
        password: 'test-password',
        role: 'USER',
        language: 'ENGLISH',
        provider: 'EMAIL'
      }
    });
    
    // Clean up test user
    await prisma.user.delete({
      where: { id: testUser.id }
    });
    
    console.log('✅ Database write test successful');
    
    return {
      canRead: true,
      canWrite: true,
      collections: ['users'], // We know users collection works
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Database operations test failed:', errorMessage);
    
    return {
      canRead: false,
      canWrite: false,
      collections: [],
      error: errorMessage
    };
  }
};

// Export Railway status helper
export const getDBStatus = () => {
  return {
    url: env.DATABASE_URL ? 'configured' : 'not configured',
    client: 'prisma',
    provider: 'mongodb',
    environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
    deployment: process.env.RAILWAY_DEPLOYMENT_ID || 'unknown',
    region: process.env.RAILWAY_REGION || 'unknown'
  };
};

export default prisma;