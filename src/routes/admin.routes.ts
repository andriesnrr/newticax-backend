import { Router } from 'express';
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
import { protect, isAdmin } from '../middlewares/auth.middleware';
import { validateCategory, validateTag } from '../middlewares/validate.middleware';

const router = Router();

// Ensure all routes are protected and require admin privilege
router.use(protect, isAdmin);

// Dashboard routes
router.get('/dashboard', getDashboardStatsHandler);

// User management
router.get('/users', getUsersHandler);
router.put('/users/:id/role', updateUserRoleHandler);
router.delete('/users/:id', deleteUserHandler);

// Category management
router.get('/categories', getCategoriesHandler);
router.post('/categories', validateCategory, createCategoryHandler);
router.put('/categories/:id', validateCategory, updateCategoryHandler);
router.delete('/categories/:id', deleteCategoryHandler);

// Tag management
router.get('/tags', getTagsHandler);
router.post('/tags', validateTag, createTagHandler);
router.put('/tags/:id', validateTag, updateTagHandler);
router.delete('/tags/:id', deleteTagHandler);

// Article management
router.put('/articles/:id/trending', toggleTrendingArticleHandler);
router.put('/articles/:id/breaking', toggleBreakingNewsHandler);

// News API sync
router.post('/sync-news', syncNewsAPIHandler);

export default router;
