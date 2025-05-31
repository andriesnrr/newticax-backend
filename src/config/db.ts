import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Create Prisma client with optimized configuration
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
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

// Enhanced connection function with retry logic
export const connectDB = async (): Promise<void> => {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      console.log('Connecting to database...');
      
      // Test the connection
      await prisma.$connect();
      
      // Perform a simple query to ensure the connection is working
      await prisma.$queryRaw`SELECT 1`;
      
      console.log('✅ Database connected successfully');
      
      // Enable query optimization in production
      if (env.NODE_ENV === 'production') {
        await prisma.$executeRaw`PRAGMA journal_mode = WAL;`.catch(() => {
          // This is for SQLite, will be ignored for other databases
        });
      }
      
      return;
    } catch (error) {
      retries++;
      console.error(`❌ Database connection attempt ${retries} failed:`, error);
      
      if (retries >= MAX_RETRIES) {
        console.error(`❌ Failed to connect to database after ${MAX_RETRIES} attempts`);
        throw new Error(`Database connection failed after ${MAX_RETRIES} attempts: ${error}`);
      }
      
      console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
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

// Database health check
export const checkDBHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// Prisma middleware for logging and performance monitoring
prisma.$use(async (params, next) => {
  const start = Date.now();
  
  try {
    const result = await next(params);
    const duration = Date.now() - start;
    
    // Log slow queries in development
    if (env.NODE_ENV === 'development' && duration > 1000) {
      console.warn(`Slow query detected: ${params.model}.${params.action} took ${duration}ms`);
    }
    
    // Log all queries in development with their duration
    if (env.NODE_ENV === 'development') {
      console.log(`Query: ${params.model}.${params.action} (${duration}ms)`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`Query failed: ${params.model}.${params.action} (${duration}ms)`, error);
    throw error;
  }
});

// Middleware for soft delete (if you implement soft delete)
prisma.$use(async (params, next) => {
  // Handle soft delete for specific models
  const softDeleteModels = ['User', 'Article', 'Comment'];
  
  if (softDeleteModels.includes(params.model || '')) {
    if (params.action === 'delete') {
      // Convert delete to update with deletedAt field
      params.action = 'update';
      params.args.data = { deletedAt: new Date() };
    }
    
    if (params.action === 'deleteMany') {
      // Convert deleteMany to updateMany with deletedAt field
      params.action = 'updateMany';
      params.args.data = { deletedAt: new Date() };
    }
    
    // Filter out soft deleted records for read operations
    if (params.action === 'findMany' || params.action === 'findFirst') {
      if (!params.args.where) {
        params.args.where = {};
      }
      params.args.where.deletedAt = null;
    }
    
    if (params.action === 'findUnique') {
      if (!params.args.where) {
        params.args.where = {};
      }
      // For findUnique, we need to be careful as it expects unique fields
      // You might want to handle this differently based on your schema
    }
  }
  
  return next(params);
});

// Connection error handlers
prisma.$on('error', (e) => {
  console.error('Prisma error event:', e);
});

// Handle uncaught database errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Close the database connection gracefully
  disconnectDB().finally(() => {
    process.exit(1);
  });
});

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing database connections...`);
  try {
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('Error during database shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default prisma;