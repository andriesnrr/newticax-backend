// backend/src/routes/interaction.routes.ts
import { Router, RequestHandler, Request, Response, NextFunction } from 'express'; // Import RequestHandler
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
// Pastikan middleware diimpor dari lokasi yang benar dan sudah diperbaiki tipenya
import { protect } from '../middlewares/auth.middleware'; 
// AuthRequest seharusnya sudah benar jika tipe User dari Prisma sudah benar
import { AuthRequest } from '../types'; 
import { validateComment } from '../middlewares/validate.middleware';

const router = Router();

// Bookmark routes
// Menambahkan 'as RequestHandler' untuk membantu TypeScript dengan inferensi tipe.
// Ini mengasumsikan handler di controller sudah memiliki signatur yang kompatibel.
router.get('/bookmarks', protect, getBookmarksHandler as RequestHandler);
router.post('/bookmarks/:articleId', protect, bookmarkArticleHandler as RequestHandler);
router.delete('/bookmarks/:articleId', protect, removeBookmarkHandler as RequestHandler);

// Like routes
router.post('/likes/:articleId', protect, likeArticleHandler as RequestHandler);
router.delete('/likes/:articleId', protect, unlikeArticleHandler as RequestHandler);

// Comment routes
// Handler 'getCommentsHandler' menerima 'Request' karena tidak ada 'protect'.
// Pastikan 'getCommentsHandler' di controller didefinisikan dengan (req: Request, ...)
router.get('/comments/:articleId', getCommentsHandler as RequestHandler); 
// Rute berikut menggunakan 'protect', jadi handler dan middleware 'validateComment'
// harus siap menerima atau bekerja dengan 'AuthRequest'.
router.post('/comments/:articleId', protect, validateComment, addCommentHandler as RequestHandler);
router.put('/comments/:commentId', protect, validateComment, updateCommentHandler as RequestHandler);
router.delete('/comments/:commentId', protect, deleteCommentHandler as RequestHandler);

// Reading history
router.get('/reading-history', protect, getReadingHistoryHandler as RequestHandler);

export default router;
