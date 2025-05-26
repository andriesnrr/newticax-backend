import { Router } from 'express';
import authRoutes from './auth.routes';
import articleRoutes from './article.routes';
import interactionRoutes from './interaction.routes';
import adminRoutes from './admin.routes';
import categoryRoutes from './category.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/articles', articleRoutes);
router.use('/interactions', interactionRoutes);
router.use('/admin', adminRoutes);
router.use('/categories', categoryRoutes);

export default router;
