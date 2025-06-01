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
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override res.json to cache the response
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

        return originalJson(data);
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
    
    // Use 'finish' event instead of overriding res.end
    res.on('finish', () => {
      // Invalidate cache patterns asynchronously only on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.all(
          patterns.map(pattern => {
            // You would implement cache pattern deletion here
            logger.info('Cache invalidation triggered', { 
              pattern, 
              method: req.method, 
              url: req.originalUrl 
            });
            // Example: deleteCachedPattern(pattern)
          })
        ).catch(error => {
          logger.error('Cache invalidation error', { error, patterns });
        });
      }
    });
    
    next();
  };
};

// Advanced cache middleware with conditional caching
export const conditionalCache = (options: {
  ttl?: number;
  condition: (req: Request, res: Response, data?: any) => boolean;
  keyGenerator?: (req: Request) => string;
  onHit?: (key: string, data: any) => void;
  onMiss?: (key: string) => void;
  onSet?: (key: string, data: any, ttl: number) => void;
}) => {
  const {
    ttl = 300,
    condition,
    keyGenerator = defaultKeyGenerator,
    onHit,
    onMiss,
    onSet,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = keyGenerator(req);

      // Try to get from cache
      const cachedData = await getCachedData(cacheKey);
      
      if (cachedData && condition(req, res, cachedData)) {
        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        if (onHit) {
          onHit(cacheKey, cachedData);
        }
        
        logger.debug('Conditional cache hit', { key: cacheKey });
        return res.json(cachedData);
      }

      if (!cachedData && onMiss) {
        onMiss(cacheKey);
      }

      // Cache miss - continue to route handler
      res.setHeader('X-Cache-Status', 'MISS');
      
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override res.json to cache the response conditionally
      res.json = function(data: any) {
        // Only cache if condition is met and response is successful
        if (res.statusCode >= 200 && res.statusCode < 300 && condition(req, res, data)) {
          setCachedData(cacheKey, data, ttl).catch(error => {
            logger.error('Conditional cache set error', { error, cacheKey });
          });
          
          if (onSet) {
            onSet(cacheKey, data, ttl);
          }
          
          logger.debug('Conditional response cached', { key: cacheKey, ttl });
        }

        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Conditional cache middleware error', { error, url: req.originalUrl });
      next();
    }
  };
};

// Cache warming middleware (preload cache with data)
export const warmCache = (keys: string[], dataLoader: (key: string) => Promise<any>, ttl: number = 3600) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Don't block the request, warm cache in background
    Promise.all(
      keys.map(async (key) => {
        try {
          const cached = await getCachedData(key);
          if (!cached) {
            const data = await dataLoader(key);
            await setCachedData(key, data, ttl);
            logger.debug('Cache warmed', { key });
          }
        } catch (error) {
          logger.error('Cache warming error', { error, key });
        }
      })
    ).catch(error => {
      logger.error('Cache warming failed', { error, keys });
    });

    next();
  };
};

// Cache statistics middleware
export const cacheStats = () => {
  const stats = {
    hits: 0,
    misses: 0,
    errors: 0,
    startTime: Date.now(),
  };

  return {
    middleware: (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      // Increment miss by default
      stats.misses++;
      
      // Listen for cache hit header
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function(name: string, value: string | string[]) {
        if (name === 'X-Cache-Status') {
          if (value === 'HIT') {
            stats.hits++;
            stats.misses--; // Remove the default miss count
          }
        }
        return originalSetHeader(name, value);
      };

      // Track errors
      res.on('error', () => {
        stats.errors++;
      });

      next();
    },
    
    getStats: () => ({
      ...stats,
      hitRate: stats.hits / (stats.hits + stats.misses) || 0,
      uptime: Date.now() - stats.startTime,
    }),
    
    reset: () => {
      stats.hits = 0;
      stats.misses = 0;
      stats.errors = 0;
      stats.startTime = Date.now();
    },
  };
};