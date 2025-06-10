// src/middlewares/loopPrevention.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Track client request patterns
interface ClientPattern {
  lastRequest: number;
  requestCount: number;
  consecutiveFailures: number;
  blocked: boolean;
  blockUntil: number;
}

const clientPatterns = new Map<string, ClientPattern>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, pattern] of clientPatterns.entries()) {
    // Remove entries older than 1 hour
    if (now - pattern.lastRequest > 60 * 60 * 1000) {
      clientPatterns.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export const loopPreventionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || 'unknown';
  const now = Date.now();
  const isAuthMeEndpoint = req.path === '/api/auth/me';
  
  // Only apply to auth/me endpoint for now
  if (!isAuthMeEndpoint) {
    return next();
  }

  let pattern = clientPatterns.get(clientIP);
  
  if (!pattern) {
    pattern = {
      lastRequest: now,
      requestCount: 1,
      consecutiveFailures: 0,
      blocked: false,
      blockUntil: 0,
    };
    clientPatterns.set(clientIP, pattern);
    return next();
  }

  // Check if client is currently blocked
  if (pattern.blocked && now < pattern.blockUntil) {
    logger.warn('Blocked client attempting request', {
      ip: clientIP,
      endpoint: req.path,
      blockTimeRemaining: pattern.blockUntil - now,
      userAgent: req.get('User-Agent'),
    });

    return res.status(429).json({
      success: false,
      message: 'Client temporarily blocked due to excessive requests. Please wait before trying again.',
      code: 'CLIENT_BLOCKED',
      retryAfter: Math.ceil((pattern.blockUntil - now) / 1000),
      action: 'stop_requests',
    });
  }

  // Reset block if time has passed
  if (pattern.blocked && now >= pattern.blockUntil) {
    pattern.blocked = false;
    pattern.blockUntil = 0;
    pattern.consecutiveFailures = 0;
    pattern.requestCount = 0;
    logger.info('Client unblocked', { ip: clientIP });
  }

  const timeSinceLastRequest = now - pattern.lastRequest;
  
  // If requests are too frequent (less than 500ms apart), it's likely a loop
  if (timeSinceLastRequest < 500) {
    pattern.requestCount++;
    
    // If more than 5 rapid requests, start blocking
    if (pattern.requestCount > 5) {
      pattern.blocked = true;
      pattern.blockUntil = now + (30 * 1000); // Block for 30 seconds initially
      
      logger.warn('Client blocked due to rapid requests', {
        ip: clientIP,
        endpoint: req.path,
        requestCount: pattern.requestCount,
        timeSinceLastRequest,
        userAgent: req.get('User-Agent'),
      });

      return res.status(429).json({
        success: false,
        message: 'Too many rapid requests detected. This looks like an infinite loop. Please check your frontend code.',
        code: 'RAPID_REQUESTS_DETECTED',
        retryAfter: 30,
        action: 'check_frontend_loop',
        hint: 'Make sure your frontend is not automatically retrying failed authentication requests',
      });
    }
  } else if (timeSinceLastRequest > 2000) {
    // Reset counter if requests are spaced out properly
    pattern.requestCount = 1;
    pattern.consecutiveFailures = 0;
  }

  pattern.lastRequest = now;
  
  // Override res.json to track failures
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    if (res.statusCode >= 400) {
      pattern.consecutiveFailures++;
      
      // If too many consecutive failures, suggest stopping
      if (pattern.consecutiveFailures >= 3) {
        data.hint = 'Multiple authentication failures detected. Please check your credentials and avoid automatic retries.';
        data.action = 'stop_auto_retry';
        
        logger.warn('Multiple consecutive auth failures', {
          ip: clientIP,
          failures: pattern.consecutiveFailures,
          userAgent: req.get('User-Agent'),
        });
      }
    } else {
      // Success - reset failure counter
      pattern.consecutiveFailures = 0;
    }
    
    return originalJson(data);
  };

  next();
};

// Middleware specifically for detecting authentication loops
export const authLoopDetection = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || 'unknown';
  const userAgent = req.get('User-Agent') || '';
  const now = Date.now();
  
  // Create a unique key for this client
  const clientKey = `${clientIP}-${userAgent.substring(0, 50)}`;
  
  if (!global.authLoopTracker) {
    global.authLoopTracker = new Map();
  }
  
  const tracker = global.authLoopTracker;
  const requests = tracker.get(clientKey) || [];
  
  // Remove requests older than 1 minute
  const recentRequests = requests.filter((timestamp: number) => now - timestamp < 60000);
  
  // If more than 10 auth requests in 1 minute, it's definitely a loop
  if (recentRequests.length >= 10) {
    logger.error('Authentication loop detected', {
      ip: clientIP,
      userAgent,
      requestsInLastMinute: recentRequests.length,
      endpoint: req.path,
    });
    
    return res.status(429).json({
      success: false,
      message: 'Authentication loop detected. Your application is making too many authentication requests.',
      code: 'AUTH_LOOP_DETECTED',
      retryAfter: 300, // 5 minutes
      troubleshooting: {
        issue: 'Your frontend appears to be stuck in an authentication loop',
        suggestions: [
          'Check if your app is automatically retrying failed auth requests',
          'Verify that failed auth responses are handled properly',
          'Make sure you\'re not calling /api/auth/me in an infinite loop',
          'Check your authentication state management',
        ],
      },
    });
  }
  
  // Add current request
  recentRequests.push(now);
  tracker.set(clientKey, recentRequests);
  
  next();
};

// Middleware to add helpful headers for frontend debugging
export const authDebugHeaders = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data: any) {
    // Add debug headers for auth endpoints
    if (req.path.startsWith('/api/auth/')) {
      res.setHeader('X-Debug-Endpoint', req.path);
      res.setHeader('X-Debug-Method', req.method);
      res.setHeader('X-Debug-Timestamp', new Date().toISOString());
      
      if (res.statusCode >= 400) {
        res.setHeader('X-Debug-Error', 'true');
        res.setHeader('X-Debug-Status', res.statusCode.toString());
        
        // Specific guidance for common issues
        if (res.statusCode === 401) {
          res.setHeader('X-Debug-Hint', 'Authentication required - check token validity');
        }
      } else {
        res.setHeader('X-Debug-Success', 'true');
      }
    }
    
    return originalJson(data);
  };
  
  next();
};

// Export utility functions
export const getClientPattern = (ip: string) => {
  return clientPatterns.get(ip);
};

export const clearClientPattern = (ip: string) => {
  clientPatterns.delete(ip);
  if (global.authLoopTracker) {
    // Clear all entries for this IP
    for (const key of global.authLoopTracker.keys()) {
      if (key.startsWith(ip)) {
        global.authLoopTracker.delete(key);
      }
    }
  }
};

export const getLoopStats = () => {
  return {
    trackedClients: clientPatterns.size,
    blockedClients: Array.from(clientPatterns.values()).filter(p => p.blocked).length,
    authRequests: global.authLoopTracker ? global.authLoopTracker.size : 0,
  };
};