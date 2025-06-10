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
import { validateCategory, validateTag } from './validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { getArticlesHandler } from '../controllers/article.controller';

const router = Router();

// Ensure all routes are protected and require admin privilege
router.use(protect, isAdmin);

// Dashboard routes
router.get('/dashboard', asyncHandler(getDashboardStatsHandler));

// User management
router.get('/users', asyncHandler(getUsersHandler));
router.put('/users/:id/role', asyncHandler(updateUserRoleHandler));
router.delete('/users/:id', asyncHandler(deleteUserHandler));

// Category management
router.get('/categories', asyncHandler(getCategoriesHandler));
router.post('/categories', validateCategory, asyncHandler(createCategoryHandler));
router.put('/categories/:id', validateCategory, asyncHandler(updateCategoryHandler));
router.delete('/categories/:id', asyncHandler(deleteCategoryHandler));

// Tag management
router.get('/tags', asyncHandler(getTagsHandler));
router.post('/tags', validateTag, asyncHandler(createTagHandler));
router.put('/tags/:id', validateTag, asyncHandler(updateTagHandler));
router.delete('/tags/:id', asyncHandler(deleteTagHandler));

// Article management
router.put('/articles/:id/trending', asyncHandler(toggleTrendingArticleHandler));
router.put('/articles/:id/breaking', asyncHandler(toggleBreakingNewsHandler));

// News API sync
router.post('/sync-news', asyncHandler(syncNewsAPIHandler));

router.get('/articles', asyncHandler(getArticlesHandler));

export default router;