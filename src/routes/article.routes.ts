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
import { validateArticleCreate, validateArticleUpdate } from '../middlewares/validate.middleware';

const router = Router();

// Public routes
router.get('/', getArticlesHandler);
router.get('/breaking', getBreakingNewsHandler);
router.get('/trending', getTrendingArticlesHandler);
router.get('/search', searchArticlesHandler);
router.get('/category/:slug', getArticlesByCategoryHandler);
router.get('/recommended', protect, getRecommendedArticlesHandler);
router.get('/:slug', getArticleBySlugHandler);
router.post('/:id/view', incrementViewCountHandler);
router.post('/:id/share', incrementShareCountHandler);

// Protected routes (for admin and authors)
router.post('/', protect, isAuthor, validateArticleCreate, createArticleHandler);
router.put('/:id', protect, isAuthor, validateArticleUpdate, updateArticleHandler);
router.delete('/:id', protect, isAdmin, deleteArticleHandler);

export default router;
