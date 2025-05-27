import { Router, RequestHandler } from 'express'; // Impor RequestHandler
// Impor controller Anda
import {
  getDashboardStatsHandler,
  getUsersHandler,
  updateUserRoleHandler,
  deleteUserHandler,
  getCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  getTagsHandler,
  createTagHandler,
  updateTagHandler,
  deleteTagHandler,
  toggleTrendingArticleHandler,
  toggleBreakingNewsHandler,
  syncNewsAPIHandler,
} from '../controllers/admin.controller'; 
// Impor middleware yang sudah diperbaiki
import { protect, isAdmin } from '../middlewares/auth.middleware';
import { validateCategory, validateTag } from '../middlewares/validate.middleware';
// Impor AuthRequest jika ada handler yang tidak melalui protect tapi butuh req.user (jarang)
// import { AuthRequest } from '../types';

const router = Router();

// Ensure all routes are protected and require admin privilege
// Middleware 'protect' dan 'isAdmin' sekarang diketik sebagai RequestHandler.
router.use(protect, isAdmin);

// Dashboard routes
// Handler controller juga harus memiliki signatur (req: AuthRequest, res: Response, next: NextFunction) => void | Promise<void>
// dan tidak me-return res.json()
router.get('/dashboard', getDashboardStatsHandler as RequestHandler);

// User management
router.get('/users', getUsersHandler as RequestHandler);
router.put('/users/:id/role', updateUserRoleHandler as RequestHandler);
router.delete('/users/:id', deleteUserHandler as RequestHandler);

// Category management
router.get('/categories', getCategoriesHandler as RequestHandler);
router.post('/categories', validateCategory, createCategoryHandler as RequestHandler);
router.put('/categories/:id', validateCategory, updateCategoryHandler as RequestHandler);
router.delete('/categories/:id', deleteCategoryHandler as RequestHandler);

// Tag management
router.get('/tags', getTagsHandler as RequestHandler);
router.post('/tags', validateTag, createTagHandler as RequestHandler);
router.put('/tags/:id', validateTag, updateTagHandler as RequestHandler);
router.delete('/tags/:id', deleteTagHandler as RequestHandler);

// Article management
router.put('/articles/:id/trending', toggleTrendingArticleHandler as RequestHandler);
router.put('/articles/:id/breaking', toggleBreakingNewsHandler as RequestHandler);

// News API sync
router.post('/sync-news', syncNewsAPIHandler as RequestHandler);

export default router;
