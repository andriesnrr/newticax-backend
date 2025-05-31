import { Request, Response, NextFunction } from 'express';
import { getCachedData, setCachedData } from '../utils/cache';
import { logger } from '../utils/logger';

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  vary?: string[];
}

// Default cache key generator
const defaultKeyGenerator = (req: Request): string => {
  const userId = (req as any).user?.id || 'anonymous';
  const query = JSON.stringify(req.query);
  const path = req.path;
  return `cache:${path}:${userId}:${Buffer.from(query).toString('base64')}`;
};

// Cache middleware factory
export const cacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = defaultKeyGenerator,
    condition = () => true,
    vary = [],
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (!condition(req, res)) {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);
      const startTime = Date.now();

      // Try to get from cache
      const cachedData = await getCachedData(cacheKey);
      
      if (cachedData) {
        const duration = Date.now() - startTime;
        
        // Set cache headers
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        if (vary.length > 0) {
          res.setHeader('Vary', vary.join(', '));
        }

        logger.debug('Cache hit', {
          key: cacheKey,
          duration: `${duration}ms`,
          url: req.originalUrl,
        });

        return res.json(cachedData);
      }

      // Cache miss - continue to route handler
      res.setHeader('X-Cache-Status', 'MISS');
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data: any) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          setCachedData(cacheKey, data, ttl).catch(error => {
            logger.error('Cache set error in middleware', { error, cacheKey });
          });
          
          res.setHeader('X-Cache-TTL', ttl.toString());
          
          logger.debug('Response cached', {
            key: cacheKey,
            ttl,
            statusCode: res.statusCode,
            url: req.originalUrl,
          });
        }

        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', { error, url: req.originalUrl });
      next(); // Continue without caching on error
    }
  };
};

// Specific cache configurations
export const shortCache = cacheMiddleware({ ttl: 60 }); // 1 minute
export const mediumCache = cacheMiddleware({ ttl: 300 }); // 5 minutes
export const longCache = cacheMiddleware({ ttl: 3600 }); // 1 hour

// User-specific cache
export const userCache = cacheMiddleware({
  ttl: 300,
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id || 'anonymous';
    return `user_cache:${userId}:${req.path}:${JSON.stringify(req.query)}`;
  },
  condition: (req: Request) => !!(req as any).user,
});

// Public content cache (longer TTL for non-user specific content)
export const publicCache = cacheMiddleware({
  ttl: 1800, // 30 minutes
  keyGenerator: (req: Request) => {
    return `public:${req.path}:${JSON.stringify(req.query)}`;
  },
  vary: ['Accept-Language', 'Accept-Encoding'],
});

// Cache invalidation middleware
export const invalidateCache = (patterns: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store patterns for post-response invalidation
    (res as any).cacheInvalidationPatterns = patterns;
    
    // Override res.end to invalidate cache after response
    const originalEnd = res.end;
    res.end = function(chunk: any, encoding: any) {
      const result = originalEnd.call(this, chunk, encoding);
      
      // Invalidate cache patterns asynchronously
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.all(
          patterns.map(pattern => {
            // You would implement cache pattern deletion here
            logger.info('Cache invalidation triggered', { 
              pattern, 
              method: req.method, 
              url: req.originalUrl 
            });
          })
        ).catch(error => {
          logger.error('Cache invalidation error', { error, patterns });
        });
      }
      
      return result;
    };
    
    next();
  };
};