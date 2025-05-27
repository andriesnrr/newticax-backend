import { Router, RequestHandler, Request, Response, NextFunction } from 'express'; // Import RequestHandler dan tipe Express dasar
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
} from '../controllers/auth.controller'; // [cite: uploaded:ultredf/newticax-/NewticaX--aa1a6087049d7f11e7cd1f82a6de6f9d731cbe1f/backend/src/controllers/auth.controller.ts]
import { protect } from '../middlewares/auth.middleware'; // [cite: uploaded:ultredf/newticax-/NewticaX--aa1a6087049d7f11e7cd1f82a6de6f9d731cbe1f/backend/src/middlewares/auth.middleware.ts]
// Pastikan AuthRequest di ../types/index.ts sudah benar menggunakan User dari @prisma/client
import { AuthRequest } from '../types'; // [cite: uploaded:ultredf/newticax-/NewticaX--aa1a6087049d7f11e7cd1f82a6de6f9d731cbe1f/backend/src/types/index.ts]
import { 
  validateRegister, 
  validateLogin, 
  validateProfileUpdate, 
  validatePasswordUpdate 
} from '../middlewares/validate.middleware'; // [cite: uploaded:ultredf/newticax-/NewticaX--aa1a6087049d7f11e7cd1f82a6de6f9d731cbe1f/backend/src/middlewares/validate.middleware.ts]

const router = Router();

// Regular auth routes
// Menambahkan 'as RequestHandler' untuk membantu TypeScript dengan inferensi tipe.
// Ini mengasumsikan handler di controller sudah memiliki signatur yang kompatibel.
router.post('/register', validateRegister, registerHandler as RequestHandler);
router.post('/login', validateLogin, loginHandler as RequestHandler);
// Rute ini menggunakan 'protect'. Handler 'getMeHandler' harus menerima 'AuthRequest'.
router.get('/me', protect, getMeHandler as RequestHandler); 
router.post('/logout', logoutHandler as RequestHandler);

// Profile routes
router.put('/profile', protect, validateProfileUpdate, updateProfileHandler as RequestHandler);
router.put('/password', protect, validatePasswordUpdate, updatePasswordHandler as RequestHandler);
router.put('/language', protect, updateLanguageHandler as RequestHandler);
router.put('/preferences', protect, updatePreferenceHandler as RequestHandler);

// Social login routes
// Rute ini menggunakan passport.authenticate, yang seharusnya menangani req/res sendiri
// sebelum memanggil callback di strategi Passport. Tipe handler tidak perlu di-cast di sini.
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
// Handler 'socialLoginCallbackHandler' akan menerima (req, res, next).
// Jika 'req' di sini diharapkan sebagai AuthRequest (misalnya, Passport mempopulasi req.user),
// maka tipe User yang benar sangat penting.
// Pastikan socialLoginCallbackHandler memiliki signatur yang benar.
router.get(
  '/callback/google',
  passport.authenticate('google', {
    failureRedirect: '/login', // Ini akan menjadi URL di frontend Anda, atau sesuaikan
    session: false, 
  }),
  socialLoginCallbackHandler as RequestHandler // Cast handler callback juga
);

router.get(
  '/callback/github',
  passport.authenticate('github', {
    failureRedirect: '/login', // Ini akan menjadi URL di frontend Anda, atau sesuaikan
    session: false, 
  }),
  socialLoginCallbackHandler as RequestHandler // Cast handler callback juga
);

export default router;
