// src/middlewares/rateLimiter.middleware.ts - Fixed wrapper
// Simple re-export from utils
export {
  authRateLimit,
  meEndpointRateLimit,
  apiRateLimit,
  strictRateLimit,
  progressiveRateLimit,
  antiSpamMiddleware,
  getFailedAttempts,
  clearFailedAttempts
} from '../utils/rateLimiter';