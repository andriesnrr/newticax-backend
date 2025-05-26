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
import { validateComment } from '../middlewares/validate.middleware';

const router = Router();

// Bookmark routes
router.get('/bookmarks', protect, getBookmarksHandler);
router.post('/bookmarks/:articleId', protect, bookmarkArticleHandler);
router.delete('/bookmarks/:articleId', protect, removeBookmarkHandler);

// Like routes
router.post('/likes/:articleId', protect, likeArticleHandler);
router.delete('/likes/:articleId', protect, unlikeArticleHandler);

// Comment routes
router.get('/comments/:articleId', getCommentsHandler);
router.post('/comments/:articleId', protect, validateComment, addCommentHandler);
router.put('/comments/:commentId', protect, validateComment, updateCommentHandler);
router.delete('/comments/:commentId', protect, deleteCommentHandler);

// Reading history
router.get('/reading-history', protect, getReadingHistoryHandler);

export default router;
