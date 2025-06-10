import { Router, RequestHandler } from 'express';
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
} from '../middlewares/validate.middleware';

const router = Router();

console.log('🔐 Auth routes loaded - JWT only mode');

// Regular auth routes (JWT-only, no OAuth)
router.post('/register', validateRegister, registerHandler as RequestHandler);
router.post('/login', validateLogin, loginHandler as RequestHandler);
router.get('/me', protect, getMeHandler as RequestHandler); 
router.post('/logout', logoutHandler as RequestHandler);

// Profile routes
router.put('/profile', protect, validateProfileUpdate, updateProfileHandler as RequestHandler);
router.put('/password', protect, validatePasswordUpdate, updatePasswordHandler as RequestHandler);
router.put('/language', protect, updateLanguageHandler as RequestHandler);
router.put('/preferences', protect, updatePreferenceHandler as RequestHandler);

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