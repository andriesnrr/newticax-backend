import { Router, RequestHandler } from 'express'; // Import RequestHandler
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
// Pastikan middleware diimpor dari lokasi yang benar dan sudah diperbaiki tipenya
import { protect, isAdmin, isAuthor } from '../middlewares/auth.middleware'; 
// AuthRequest seharusnya sudah benar jika tipe User dari Prisma sudah benar
import { AuthRequest } from '../types'; 
import { validateArticleCreate, validateArticleUpdate } from '../middlewares/validate.middleware';

const router = Router();

// Public routes
// Menambahkan 'as RequestHandler' untuk membantu TypeScript dengan inferensi tipe.
// Ini mengasumsikan handler di controller sudah memiliki signatur yang kompatibel.
router.get('/', getArticlesHandler as RequestHandler);
router.get('/breaking', getBreakingNewsHandler as RequestHandler);
router.get('/trending', getTrendingArticlesHandler as RequestHandler); // Error TS2769 sebelumnya di sini
router.get('/search', searchArticlesHandler as RequestHandler);
router.get('/category/:slug', getArticlesByCategoryHandler as RequestHandler);

// Rute ini menggunakan 'protect'. Handler 'getRecommendedArticlesHandler' harus menerima 'AuthRequest'.
// Jika tipe User di AuthRequest sudah benar, masalah "missing properties" seharusnya hilang.
// Error "Types of parameters 'res' and 'req' are incompatible" yang aneh mungkin teratasi
// dengan perbaikan di middleware 'protect' dan type assertion di sini.
router.get('/recommended', protect, getRecommendedArticlesHandler as RequestHandler); 

router.get('/:slug', getArticleBySlugHandler as RequestHandler);
router.post('/:id/view', incrementViewCountHandler as RequestHandler);
router.post('/:id/share', incrementShareCountHandler as RequestHandler);

// Protected routes (for admin and authors)
// Pastikan middleware 'protect', 'isAuthor', 'validateArticleCreate'
// dan handler 'createArticleHandler' memiliki signatur yang benar.
router.post('/', protect, isAuthor, validateArticleCreate, createArticleHandler as RequestHandler);
router.put('/:id', protect, isAuthor, validateArticleUpdate, updateArticleHandler as RequestHandler);
router.delete('/:id', protect, isAdmin, deleteArticleHandler as RequestHandler);

export default router;
