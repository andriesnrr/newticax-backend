// src/utils/cache.ts - Modified with fallback
import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// In-memory cache fallback
interface CacheItem {
  value: any;
  expiry: number;
}

const memoryCache = new Map<string, CacheItem>();

// Redis client instance
let redis: Redis | null = null;
let useRedis = false;

// Clean up expired items every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of memoryCache.entries()) {
    if (item.expiry < now) {
      memoryCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Initialize Redis connection with fallback
export const initializeCache = (): void => {
  // Skip Redis if REDIS_URL is not configured
  if (!env.REDIS_URL || env.REDIS_URL === 'redis://localhost:6379') {
    logger.info('Redis URL not configured, using in-memory cache fallback');
    useRedis = false;
    return;
  }

  try {
    const redisConfig = parseRedisUrl(env.REDIS_URL);
    
    // Create Redis instance with valid options only
    redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      // Valid ioredis options
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      connectTimeout: 5000,
      commandTimeout: 3000,
      keyPrefix: 'newticax:',
      // Additional valid options
      retryDelayOnFailover: 100,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
      maxLoadingTimeout: 5000,
    });

    redis.on('connect', () => {
      useRedis = true;
      logger.info('Redis connected successfully', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
      });
    });

    redis.on('error', (error: Error) => {
      useRedis = false;
      logger.warn('Redis connection error, falling back to memory cache', { 
        error: error.message 
      });
    });

    redis.on('close', () => {
      useRedis = false;
      logger.warn('Redis connection closed, using memory cache');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    redis.on('ready', () => {
      useRedis = true;
      logger.info('Redis is ready');
    });

  } catch (error) {
    useRedis = false;
    logger.warn('Redis initialization failed, using memory cache fallback', { error });
    redis = null;
  }
};

// Parse Redis URL helper function
const parseRedisUrl = (url: string) => {
  try {
    const redisUrl = new URL(url);
    return {
      host: redisUrl.hostname || 'localhost',
      port: parseInt(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? parseInt(redisUrl.pathname.slice(1)) || 0 : 0,
    };
  } catch (error) {
    throw new Error(`Invalid Redis URL: ${url}`);
  }
};

// Memory cache operations
const memoryGet = (key: string): any => {
  const item = memoryCache.get(key);
  if (!item) return null;
  
  if (item.expiry < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return item.value;
};

const memorySet = (key: string, value: any, ttlSeconds: number): void => {
  const expiry = Date.now() + (ttlSeconds * 1000);
  memoryCache.set(key, { value, expiry });
};

const memoryDelete = (key: string): boolean => {
  return memoryCache.delete(key);
};

// Get data from cache (Redis or Memory)
export const getCachedData = async (key: string): Promise<any> => {
  const startTime = Date.now();
  
  try {
    if (useRedis && redis) {
      const data = await redis.get(key);
      const duration = Date.now() - startTime;
      
      if (data) {
        logger.debug('Redis cache hit', { key, duration: `${duration}ms` });
        return JSON.parse(data);
      } else {
        logger.debug('Redis cache miss', { key, duration: `${duration}ms` });
        return null;
      }
    } else {
      // Fallback to memory cache
      const data = memoryGet(key);
      const duration = Date.now() - startTime;
      
      if (data) {
        logger.debug('Memory cache hit', { key, duration: `${duration}ms` });
        return data;
      } else {
        logger.debug('Memory cache miss', { key, duration: `${duration}ms` });
        return null;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache get error', { error: errorMessage, key });
    
    // Fallback to memory cache if Redis fails
    if (useRedis) {
      const data = memoryGet(key);
      if (data) {
        logger.debug('Memory cache fallback hit', { key });
        return data;
      }
    }
    
    return null;
  }
};

// Set data in cache (Redis or Memory)
export const setCachedData = async (
  key: string,
  data: any,
  ttl: number = env.CACHE_TTL
): Promise<void> => {
  const startTime = Date.now();
  
  try {
    if (useRedis && redis) {
      const serializedData = JSON.stringify(data);
      await redis.setex(key, ttl, serializedData);
      const duration = Date.now() - startTime;
      
      logger.debug('Redis cache set', { 
        key, 
        ttl, 
        size: `${serializedData.length} bytes`,
        duration: `${duration}ms`,
      });
    } else {
      // Fallback to memory cache
      memorySet(key, data, ttl);
      const duration = Date.now() - startTime;
      
      logger.debug('Memory cache set', { 
        key, 
        ttl, 
        duration: `${duration}ms`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache set error', { error: errorMessage, key, ttl });
    
    // Fallback to memory cache if Redis fails
    if (useRedis) {
      memorySet(key, data, ttl);
      logger.debug('Memory cache fallback set', { key });
    }
  }
};

// Delete data from cache
export const deleteCachedData = async (key: string): Promise<void> => {
  try {
    if (useRedis && redis) {
      const result = await redis.del(key);
      logger.debug('Redis cache delete', { key, deleted: result > 0 });
    } else {
      const deleted = memoryDelete(key);
      logger.debug('Memory cache delete', { key, deleted });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache delete error', { error: errorMessage, key });
    
    // Fallback to memory cache
    if (useRedis) {
      memoryDelete(key);
    }
  }
};

// Delete multiple keys (pattern)
export const deleteCachedPattern = async (pattern: string): Promise<void> => {
  try {
    if (useRedis && redis) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug('Redis cache pattern delete', { pattern, keysDeleted: keys.length });
      }
    } else {
      // Memory cache pattern delete
      let deletedCount = 0;
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      
      for (const key of memoryCache.keys()) {
        if (regex.test(key)) {
          memoryCache.delete(key);
          deletedCount++;
        }
      }
      
      logger.debug('Memory cache pattern delete', { pattern, keysDeleted: deletedCount });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache pattern delete error', { error: errorMessage, pattern });
  }
};

// Get cache statistics
export const getCacheStats = async (): Promise<any> => {
  try {
    if (useRedis && redis) {
      const info = await redis.info('memory');
      const keyCount = await redis.dbsize();
      
      return {
        available: true,
        type: 'redis',
        keyCount,
        memoryInfo: info,
        connected: useRedis,
      };
    } else {
      return {
        available: true,
        type: 'memory',
        keyCount: memoryCache.size,
        memoryUsage: `${memoryCache.size} items`,
        connected: false,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache stats error', { error: errorMessage });
    return { 
      available: false, 
      type: 'none',
      error: errorMessage,
      connected: false,
    };
  }
};

// Check cache type
export const getCacheType = (): 'redis' | 'memory' | 'none' => {
  if (useRedis && redis) return 'redis';
  if (memoryCache.size >= 0) return 'memory';
  return 'none';
};

// Check if Redis is connected
export const isRedisConnected = (): boolean => {
  return useRedis && redis?.status === 'ready';
};

// Get Redis instance (for advanced operations)
export const getRedisInstance = (): Redis | null => {
  return useRedis ? redis : null;
};

// Disconnect Redis
export const disconnectRedis = async (): Promise<void> => {
  if (redis) {
    try {
      await redis.quit();
      redis = null;
      useRedis = false;
      logger.info('Redis disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Redis disconnect error', { error: errorMessage });
    }
  }
};

// Cache with TTL and automatic JSON handling
export const cacheSet = async (
  key: string,
  value: any,
  ttlSeconds: number = 3600
): Promise<boolean> => {
  try {
    await setCachedData(key, value, ttlSeconds);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache set operation failed', { error: errorMessage, key });
    return false;
  }
};

// Cache get with automatic JSON parsing
export const cacheGet = async <T = any>(key: string): Promise<T | null> => {
  try {
    return await getCachedData(key) as T | null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache get operation failed', { error: errorMessage, key });
    return null;
  }
};

// Cache increment operation
export const cacheIncrement = async (
  key: string,
  increment: number = 1
): Promise<number> => {
  if (!useRedis || !redis) {
    // Memory cache increment
    const current = memoryGet(key) || 0;
    const newValue = (typeof current === 'number' ? current : 0) + increment;
    memorySet(key, newValue, 3600); // Default 1 hour TTL
    return newValue;
  }

  try {
    return await redis.incrby(key, increment);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache increment error', { error: errorMessage, key });
    return 0;
  }
};

// Cache with expiration check
export const cacheGetWithTTL = async (key: string): Promise<{ value: any; ttl: number } | null> => {
  if (!useRedis || !redis) {
    // Memory cache TTL check
    const item = memoryCache.get(key);
    if (item) {
      const ttl = Math.max(0, Math.floor((item.expiry - Date.now()) / 1000));
      return {
        value: item.value,
        ttl
      };
    }
    return null;
  }

  try {
    const [value, ttl] = await Promise.all([
      redis.get(key),
      redis.ttl(key)
    ]);

    if (value) {
      return {
        value: JSON.parse(value),
        ttl
      };
    }
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache get with TTL error', { error: errorMessage, key });
    return null;
  }
};

// Clear all cache
export const clearCache = async (): Promise<void> => {
  try {
    if (useRedis && redis) {
      await redis.flushdb();
      logger.info('Redis cache cleared');
    } else {
      memoryCache.clear();
      logger.info('Memory cache cleared');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache clear error', { error: errorMessage });
  }
};

// Initialize cache on module load
initializeCache();

// Parse Redis URL helper function
const parseRedisUrl = (url: string) => {
  try {
    const redisUrl = new URL(url);
    return {
      host: redisUrl.hostname || 'localhost',
      port: parseInt(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
      db: redisUrl.pathname ? parseInt(redisUrl.pathname.slice(1)) || 0 : 0,
    };
  } catch (error) {
    throw new Error(`Invalid Redis URL: ${url}`);
  }
};

// Memory cache operations
const memoryGet = (key: string): any => {
  const item = memoryCache.get(key);
  if (!item) return null;
  
  if (item.expiry < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return item.value;
};

const memorySet = (key: string, value: any, ttlSeconds: number): void => {
  const expiry = Date.now() + (ttlSeconds * 1000);
  memoryCache.set(key, { value, expiry });
};

const memoryDelete = (key: string): boolean => {
  return memoryCache.delete(key);
};

// Get data from cache (Redis or Memory)
export const getCachedData = async (key: string): Promise<any> => {
  const startTime = Date.now();
  
  try {
    if (useRedis && redis) {
      const data = await redis.get(key);
      const duration = Date.now() - startTime;
      
      if (data) {
        logger.debug('Redis cache hit', { key, duration: `${duration}ms` });
        return JSON.parse(data);
      } else {
        logger.debug('Redis cache miss', { key, duration: `${duration}ms` });
        return null;
      }
    } else {
      // Fallback to memory cache
      const data = memoryGet(key);
      const duration = Date.now() - startTime;
      
      if (data) {
        logger.debug('Memory cache hit', { key, duration: `${duration}ms` });
        return data;
      } else {
        logger.debug('Memory cache miss', { key, duration: `${duration}ms` });
        return null;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache get error', { error: errorMessage, key });
    
    // Fallback to memory cache if Redis fails
    if (useRedis) {
      const data = memoryGet(key);
      if (data) {
        logger.debug('Memory cache fallback hit', { key });
        return data;
      }
    }
    
    return null;
  }
};

// Set data in cache (Redis or Memory)
export const setCachedData = async (
  key: string,
  data: any,
  ttl: number = env.CACHE_TTL
): Promise<void> => {
  const startTime = Date.now();
  
  try {
    if (useRedis && redis) {
      const serializedData = JSON.stringify(data);
      await redis.setex(key, ttl, serializedData);
      const duration = Date.now() - startTime;
      
      logger.debug('Redis cache set', { 
        key, 
        ttl, 
        size: `${serializedData.length} bytes`,
        duration: `${duration}ms`,
      });
    } else {
      // Fallback to memory cache
      memorySet(key, data, ttl);
      const duration = Date.now() - startTime;
      
      logger.debug('Memory cache set', { 
        key, 
        ttl, 
        duration: `${duration}ms`,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache set error', { error: errorMessage, key, ttl });
    
    // Fallback to memory cache if Redis fails
    if (useRedis) {
      memorySet(key, data, ttl);
      logger.debug('Memory cache fallback set', { key });
    }
  }
};

// Delete data from cache
export const deleteCachedData = async (key: string): Promise<void> => {
  try {
    if (useRedis && redis) {
      const result = await redis.del(key);
      logger.debug('Redis cache delete', { key, deleted: result > 0 });
    } else {
      const deleted = memoryDelete(key);
      logger.debug('Memory cache delete', { key, deleted });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache delete error', { error: errorMessage, key });
    
    // Fallback to memory cache
    if (useRedis) {
      memoryDelete(key);
    }
  }
};

// Get cache statistics
export const getCacheStats = async (): Promise<any> => {
  try {
    if (useRedis && redis) {
      const info = await redis.info('memory');
      const keyCount = await redis.dbsize();
      
      return {
        available: true,
        type: 'redis',
        keyCount,
        memoryInfo: info,
      };
    } else {
      return {
        available: true,
        type: 'memory',
        keyCount: memoryCache.size,
        memoryUsage: `${memoryCache.size} items`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Cache stats error', { error: errorMessage });
    return { 
      available: false, 
      type: 'none',
      error: errorMessage 
    };
  }
};

// Check cache type
export const getCacheType = (): 'redis' | 'memory' | 'none' => {
  if (useRedis && redis) return 'redis';
  if (memoryCache.size >= 0) return 'memory';
  return 'none';
};

// Initialize cache on module load
initializeCache();