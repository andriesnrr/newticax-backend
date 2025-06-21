import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Create Prisma client with Railway-optimized configuration for MongoDB
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  errorFormat: 'pretty',
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

// Railway-optimized connection configuration
const MAX_RETRIES = process.env.RAILWAY_ENVIRONMENT ? 25 : 10;
const RETRY_DELAY = process.env.RAILWAY_ENVIRONMENT ? 3000 : 2000;
const CONNECTION_TIMEOUT = process.env.RAILWAY_ENVIRONMENT ? 60000 : 30000;
const HEALTH_CHECK_TIMEOUT = 10000;

export const connectDB = async (): Promise<void> => {
  let retries = 0;
  
  console.log('🔌 Starting MongoDB connection...');
  console.log('📊 Connection config:', {
    maxRetries: MAX_RETRIES,
    retryDelay: RETRY_DELAY,
    timeout: CONNECTION_TIMEOUT,
    environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
    databaseUrl: env.DATABASE_URL ? '✅ Set' : '❌ Missing'
  });

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Validate MongoDB connection string format
  if (!env.DATABASE_URL.startsWith('mongodb://') && !env.DATABASE_URL.startsWith('mongodb+srv://')) {
    throw new Error('DATABASE_URL must be a valid MongoDB connection string (mongodb:// or mongodb+srv://)');
  }
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`🔌 MongoDB connection attempt ${retries + 1}/${MAX_RETRIES}...`);
      
      // Test connection with extended timeout for Railway
      const connectionPromise = prisma.$connect();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      
      // Test database connection with MongoDB-compatible operation
      try {
        // Use a simple count operation to test connection
        const testTimeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Query timeout')), 5000);
        });
        
        const testQuery = prisma.user.count();
        await Promise.race([testQuery, testTimeout]);
        console.log('✅ MongoDB connection and query test successful');
      } catch (queryError) {
        console.log('✅ MongoDB connection successful (collections will be created as needed)');
      }
      
      console.log('✅ MongoDB connected successfully');
      console.log(`📊 Database URL host: ${new URL(env.DATABASE_URL).hostname}`);
      
      return;
    } catch (error) {
      retries++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`❌ MongoDB connection attempt ${retries} failed:`, {
        error: errorMessage,
        retries,
        maxRetries: MAX_RETRIES,
        isRailway: !!process.env.RAILWAY_ENVIRONMENT,
        willRetry: retries < MAX_RETRIES
      });
      
      if (retries >= MAX_RETRIES) {
        console.error(`❌ Failed to connect to MongoDB after ${MAX_RETRIES} attempts`);
        console.error('💡 MongoDB troubleshooting tips:');
        console.error('   - Check if DATABASE_URL is correct in Railway dashboard');
        console.error('   - Verify MongoDB Atlas cluster is running and accessible');
        console.error('   - Ensure IP whitelist includes 0.0.0.0/0 for Railway');
        console.error('   - Check if database user has correct permissions');
        console.error('   - Verify network connectivity from Railway region');
        console.error('   - Try connecting from MongoDB Compass with the same URL');
        console.error('   - Check MongoDB Atlas status page for outages');
        
        throw new Error(`MongoDB connection failed after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
      
      const waitTime = RETRY_DELAY * (retries + 1); // Progressive backoff
      console.log(`⏳ Retrying MongoDB connection in ${waitTime / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Enhanced disconnect function
export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('✅ MongoDB disconnected successfully');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
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
    // Create timeout promise
    const healthTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT);
    });

    // Test with MongoDB-compatible operations
    const healthCheck = async () => {
      // Simple connection test using count operation
      const userCount = await prisma.user.count();
      return userCount;
    };

    const userCount = await Promise.race([healthCheck(), healthTimeout]);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`💚 MongoDB health check: OK (${responseTime}ms) - Users: ${userCount}`);
    return {
      connected: true,
      responseTime,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
      collections: 1 // At least user collection exists
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`💔 MongoDB health check failed (${responseTime}ms):`, errorMessage);
    return {
      connected: false,
      responseTime,
      error: errorMessage,
      environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
      collections: 0
    };
  }
};

// Railway-specific middleware with performance monitoring for MongoDB
prisma.$use(async (params, next) => {
  const start = Date.now();
  
  try {
    const result = await next(params);
    const duration = Date.now() - start;
    
    // Log slow queries with Railway context
    if (duration > 2000) {
      console.warn(`🐌 Slow MongoDB query: ${params.model}.${params.action} took ${duration}ms`, {
        environment: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
        deployment: process.env.RAILWAY_DEPLOYMENT_ID,
        args: JSON.stringify(params.args).substring(0, 100)
      });
    }
    
    // Log all queries in development
    if (env.NODE_ENV === 'development') {
      console.log(`📝 MongoDB Query: ${params.model}.${params.action} (${duration}ms)`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`💥 MongoDB query failed: ${params.model}.${params.action} (${duration}ms)`, {
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
    console.log('🔌 Attempting graceful MongoDB disconnect...');
    disconnectDB().finally(() => {
      if (process.env.RAILWAY_ENVIRONMENT) {
        console.log('⚠️ Railway environment: logging error but not exiting');
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
  console.log(`📡 Received ${signal}, closing MongoDB connections...`);
  try {
    await disconnectDB();
    console.log('👋 MongoDB shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('💥 Error during MongoDB shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Test database operations helper for Railway debugging
export const testDatabaseOperations = async (): Promise<{
  canRead: boolean;
  canWrite: boolean;
  collections: string[];
  error?: string;
}> => {
  try {
    console.log('🧪 Testing MongoDB operations...');
    
    // Test read operation
    const userCount = await prisma.user.count();
    console.log(`📊 MongoDB read test: Found ${userCount} users`);
    
    // Test write operation (create a test record and delete it)
    const testEmail = `test-${Date.now()}@railway-test.com`;
    const testUsername = `test-${Date.now()}`;
    
    const testUser = await prisma.user.create({
      data: {
        name: 'Railway Test User',
        email: testEmail,
        username: testUsername,
        password: 'test-password-for-railway',
        role: 'USER',
        language: 'ENGLISH',
        provider: 'EMAIL'
      }
    });
    
    console.log(`✅ MongoDB write test: Created user ${testUser.id}`);
    
    // Clean up test user
    await prisma.user.delete({
      where: { id: testUser.id }
    });
    
    console.log('🧹 Test user cleaned up');
    console.log('✅ MongoDB operations test successful');
    
    return {
      canRead: true,
      canWrite: true,
      collections: ['users'], // We know users collection works
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ MongoDB operations test failed:', errorMessage);
    
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
    region: process.env.RAILWAY_REGION || 'unknown',
    nodeEnv: env.NODE_ENV
  };
};

// Railway connection retry helper
export const retryConnection = async (maxRetries: number = 5): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      const health = await checkDBHealth();
      if (health.connected) {
        console.log(`✅ MongoDB connection retry ${i + 1} successful`);
        return true;
      }
    } catch (error) {
      console.log(`❌ MongoDB connection retry ${i + 1} failed:`, error);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }
  return false;
};

// MongoDB-specific connection string validation
export const validateMongoDBUrl = (url: string): { valid: boolean; error?: string } => {
  try {
    if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) {
      return {
        valid: false,
        error: 'URL must start with mongodb:// or mongodb+srv://'
      };
    }

    const parsedUrl = new URL(url);
    
    if (!parsedUrl.hostname) {
      return {
        valid: false,
        error: 'Invalid hostname in MongoDB URL'
      };
    }

    // Check for required parts
    if (url.includes('mongodb+srv://') && !parsedUrl.pathname) {
      return {
        valid: false,
        error: 'Database name is required in MongoDB Atlas URL'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid MongoDB URL format'
    };
  }
};

export default prisma;