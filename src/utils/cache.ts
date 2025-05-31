import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// Redis client instance
let redis: Redis | null = null;

// Initialize Redis connection
export const initializeCache = (): void => {
  try {
    redis = new Redis(env.REDIS_URL, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

  } catch (error) {
    logger.error('Redis initialization failed', { error });
    redis = null;
  }
};

// Get data from cache
export const getCachedData = async (key: string): Promise<any> => {
  if (!redis) {
    logger.warn('Redis not available, skipping cache get', { key });
    return null;
  }

  try {
    const startTime = Date.now();
    const data = await redis.get(key);
    const duration = Date.now() - startTime;

    if (data) {
      logger.debug('Cache hit', { key, duration: `${duration}ms` });
      return JSON.parse(data);
    } else {
      logger.debug('Cache miss', { key, duration: `${duration}ms` });
      return null;
    }
  } catch (error) {
    logger.error('Cache get error', { error, key });
    return null;
  }
};

// Set data in cache
export const setCachedData = async (
  key: string,
  data: any,
  ttl: number = env.CACHE_TTL
): Promise<void> => {
  if (!redis) {
    logger.warn('Redis not available, skipping cache set', { key });
    return;
  }

  try {
    const startTime = Date.now();
    const serializedData = JSON.stringify(data);
    await redis.setex(key, ttl, serializedData);
    const duration = Date.now() - startTime;

    logger.debug('Cache set', { 
      key, 
      ttl, 
      size: `${serializedData.length} bytes`,
      duration: `${duration}ms`,
    });
  } catch (error) {
    logger.error('Cache set error', { error, key, ttl });
  }
};

// Delete data from cache
export const deleteCachedData = async (key: string): Promise<void> => {
  if (!redis) {
    logger.warn('Redis not available, skipping cache delete', { key });
    return;
  }

  try {
    const result = await redis.del(key);
    logger.debug('Cache delete', { key, deleted: result > 0 });
  } catch (error) {
    logger.error('Cache delete error', { error, key });
  }
};

// Delete multiple keys (pattern)
export const deleteCachedPattern = async (pattern: string): Promise<void> => {
  if (!redis) {
    logger.warn('Redis not available, skipping pattern delete', { pattern });
    return;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.debug('Cache pattern delete', { pattern, keysDeleted: keys.length });
    }
  } catch (error) {
    logger.error('Cache pattern delete error', { error, pattern });
  }
};

// Get cache statistics
export const getCacheStats = async (): Promise<any> => {
  if (!redis) {
    return { available: false };
  }

  try {
    const info = await redis.info('memory');
    const keyCount = await redis.dbsize();
    
    return {
      available: true,
      keyCount,
      memoryInfo: info,
    };
  } catch (error) {
    logger.error('Cache stats error', { error });
    return { available: false, error: error.message };
  }
};

// Initialize cache on module load
initializeCache();