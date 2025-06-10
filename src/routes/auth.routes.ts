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

const router = Router();

console.log('🔐 Auth routes loaded - JWT only mode');

// Regular auth routes (JWT-only, no OAuth)
router.post('/register', validateRegister, asyncHandler(registerHandler));
router.post('/login', validateLogin, asyncHandler(loginHandler));
router.get('/me', protect, asyncHandler(getMeHandler)); 
router.post('/logout', asyncHandler(logoutHandler));

// Profile routes
router.put('/profile', protect, validateProfileUpdate, asyncHandler(updateProfileHandler));
router.put('/password', protect, validatePasswordUpdate, asyncHandler(updatePasswordHandler));
router.put('/language', protect, asyncHandler(updateLanguageHandler));
router.put('/preferences', protect, asyncHandler(updatePreferenceHandler));

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