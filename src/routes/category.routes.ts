import { Router } from 'express';
import { getCategoryBySlug } from '../controllers/category.controller';

const router = Router();

// Public routes
router.get('/:slug', getCategoryBySlug);

export default router;