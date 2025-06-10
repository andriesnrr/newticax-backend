// src/routes/auth.routes.ts
import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
  logoutHandler,
  updateProfileHandler,
  updatePasswordHandler,
  updateLanguageHandler,
  updatePreferenceHandler,
} from '../controllers/auth.controller';
import { protect } from '../middlewares/auth.middleware';
import { 
  validateRegister, 
  validateLogin, 
  validateProfileUpdate, 
  validatePasswordUpdate 
} from './validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import rateLimit from 'express-rate-limit';

const router = Router();

console.log('🔐 Auth routes loaded - JWT only mode');

// Strict rate limiter for password changes
const strictRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Very strict
  message: {
    success: false,
    message: 'Too many requests for this sensitive operation.',
    code: 'STRICT_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Regular auth routes (JWT-only, no OAuth)
router.post('/register', validateRegister, asyncHandler(registerHandler));
router.post('/login', validateLogin, asyncHandler(loginHandler));

// /me endpoint - rate limiting is handled at app level
router.get('/me', protect, asyncHandler(getMeHandler)); 

// Logout doesn't need strict rate limiting
router.post('/logout', asyncHandler(logoutHandler));

// Profile routes with moderate rate limiting
router.put('/profile', protect, validateProfileUpdate, asyncHandler(updateProfileHandler));
router.put('/language', protect, asyncHandler(updateLanguageHandler));
router.put('/preferences', protect, asyncHandler(updatePreferenceHandler));

// Password change needs strict rate limiting
router.put('/password', strictRateLimit, protect, validatePasswordUpdate, asyncHandler(updatePasswordHandler));

// OAuth disabled routes - return info message
router.get('/google', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'OAuth authentication is disabled for Railway deployment. Please use email/password login.',
    alternative: {
      endpoint: '/api/auth/login',
      method: 'POST',
      body: {
        email: 'your_email@example.com',
        password: 'your_password'
      }
    }
  });
});

router.get('/github', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'OAuth authentication is disabled for Railway deployment. Please use email/password login.',
    alternative: {
      endpoint: '/api/auth/login',
      method: 'POST',
      body: {
        email: 'your_email@example.com',
        password: 'your_password'
      }
    }
  });
});

router.get('/callback/google', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'OAuth callbacks are disabled for Railway deployment.'
  });
});

router.get('/callback/github', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'OAuth callbacks are disabled for Railway deployment.'
  });
});

export default router;