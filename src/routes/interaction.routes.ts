import { Router } from 'express';
import {
  bookmarkArticleHandler,
  getBookmarksHandler,
  removeBookmarkHandler,
  likeArticleHandler,
  unlikeArticleHandler,
  addCommentHandler,
  getCommentsHandler,
  updateCommentHandler,
  deleteCommentHandler,
  getReadingHistoryHandler,
} from '../controllers/interaction.controller';
import { protect } from '../middlewares/auth.middleware';
import { validateComment } from './validate.middleware';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Bookmark routes
router.get('/bookmarks', protect, asyncHandler(getBookmarksHandler));
router.post('/bookmarks/:articleId', protect, asyncHandler(bookmarkArticleHandler));
router.delete('/bookmarks/:articleId', protect, asyncHandler(removeBookmarkHandler));

// Like routes
router.post('/likes/:articleId', protect, asyncHandler(likeArticleHandler));
router.delete('/likes/:articleId', protect, asyncHandler(unlikeArticleHandler));

// Comment routes
router.get('/comments/:articleId', asyncHandler(getCommentsHandler));
router.post('/comments/:articleId', protect, validateComment, asyncHandler(addCommentHandler));
router.put('/comments/:commentId', protect, validateComment, asyncHandler(updateCommentHandler));
router.delete('/comments/:commentId', protect, asyncHandler(deleteCommentHandler));

// Reading history
router.get('/reading-history', protect, asyncHandler(getReadingHistoryHandler));

export default router;
