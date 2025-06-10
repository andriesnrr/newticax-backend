import { Router } from 'express';
import {
  getArticlesHandler,
  getArticleBySlugHandler,
  createArticleHandler,
  updateArticleHandler,
  deleteArticleHandler,
  getBreakingNewsHandler,
  getTrendingArticlesHandler,
  searchArticlesHandler,
  getArticlesByCategoryHandler,
  getRecommendedArticlesHandler,
  incrementViewCountHandler,
  incrementShareCountHandler,
} from '../controllers/article.controller';
import { protect, isAdmin, isAuthor } from '../middlewares/auth.middleware';
import { validateArticleCreate, validateArticleUpdate } from './validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Public routes
router.get('/', asyncHandler(getArticlesHandler));
router.get('/breaking', asyncHandler(getBreakingNewsHandler));
router.get('/trending', asyncHandler(getTrendingArticlesHandler));
router.get('/search', asyncHandler(searchArticlesHandler));
router.get('/category/:slug', asyncHandler(getArticlesByCategoryHandler));

// Protected routes
router.get('/recommended', protect, asyncHandler(getRecommendedArticlesHandler));
router.get('/:slug', asyncHandler(getArticleBySlugHandler));
router.post('/:id/view', asyncHandler(incrementViewCountHandler));
router.post('/:id/share', asyncHandler(incrementShareCountHandler));

// Author/Admin routes
router.post('/', protect, isAuthor, validateArticleCreate, asyncHandler(createArticleHandler));
router.put('/:id', protect, isAuthor, validateArticleUpdate, asyncHandler(updateArticleHandler));
router.delete('/:id', protect, isAdmin, asyncHandler(deleteArticleHandler));

export default router;
