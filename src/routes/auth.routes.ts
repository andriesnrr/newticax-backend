import { Router } from 'express';
import passport from 'passport';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
  logoutHandler,
  socialLoginCallbackHandler,
  updateProfileHandler,
  updatePasswordHandler,
  updateLanguageHandler,
  updatePreferenceHandler,
} from '../controllers/auth.controller';
import { protect } from '../middlewares/auth.middleware';
import { validateRegister, validateLogin, validateProfileUpdate, validatePasswordUpdate } from '../middlewares/validate.middleware';

const router = Router();

// Regular auth routes
router.post('/register', validateRegister, registerHandler);
router.post('/login', validateLogin, loginHandler);
router.get('/me', protect, getMeHandler);
router.post('/logout', logoutHandler);

// Profile routes
router.put('/profile', protect, validateProfileUpdate, updateProfileHandler);
router.put('/password', protect, validatePasswordUpdate, updatePasswordHandler);
router.put('/language', protect, updateLanguageHandler);
router.put('/preferences', protect, updatePreferenceHandler);

// Social login routes
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email'],
    session: false,
  })
);

// Social login callbacks
router.get(
  '/callback/google',
  passport.authenticate('google', {
    failureRedirect: '/login',
    session: false,
  }),
  socialLoginCallbackHandler
);

router.get(
  '/callback/github',
  passport.authenticate('github', {
    failureRedirect: '/login',
    session: false,
  }),
  socialLoginCallbackHandler
);

export default router;
