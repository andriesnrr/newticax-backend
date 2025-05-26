import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';

// Get category by slug
export const getCategoryBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    
    // Find category
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
};