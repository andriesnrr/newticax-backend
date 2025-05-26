import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';
import { Role, Language } from '@prisma/client';
import { syncNewsFromAPI } from '../services/news-api.service';
import slugify from 'slugify';

// Get dashboard stats
export const getDashboardStatsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get counts of different entities
    const userCount = await prisma.user.count();
    const articleCount = await prisma.article.count();
    const commentCount = await prisma.comment.count();
    const categoryCount = await prisma.category.count();

    // Get top articles by views
    const topArticles = await prisma.article.findMany({
      orderBy: { viewCount: 'desc' },
      take: 5,
      include: {
        category: true,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    // Get recent articles
    const recentArticles = await prisma.article.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Get recent users
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Get article stats
    const stats = {
      totalViews: await prisma.article.aggregate({
        _sum: { viewCount: true },
      }),
      totalLikes: await prisma.like.count(),
      totalBookmarks: await prisma.bookmark.count(),
      totalShares: await prisma.article.aggregate({
        _sum: { shareCount: true },
      }),
    };

    res.status(200).json({
      success: true,
      data: {
        counts: {
          users: userCount,
          articles: articleCount,
          comments: commentCount,
          categories: categoryCount,
        },
        topArticles,
        recentArticles,
        recentUsers,
        stats: {
          totalViews: stats.totalViews._sum.viewCount || 0,
          totalLikes: stats.totalLikes,
          totalBookmarks: stats.totalBookmarks,
          totalShares: stats.totalShares._sum.shareCount || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get all users (admin only)
export const getUsersHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    
    // Build query
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Count total users
    const total = await prisma.user.count({ where });
    
    // Get paginated users
    const users = await prisma.user.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Remove passwords from users
    const usersWithoutPassword = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.status(200).json({
      success: true,
      data: usersWithoutPassword,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update user role (admin only)
export const updateUserRoleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    if (!Object.values(Role).includes(role)) {
      throw new AppError('Invalid role', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
    });

    // Return updated user (without password)
    const { password, ...userData } = updatedUser;
    
    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

// Delete user (admin only)
export const deleteUserHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Find user
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Prevent deleting the last admin
    if (user.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN },
      });

      if (adminCount <= 1) {
        throw new AppError('Cannot delete the last admin user', 400);
      }
    }

    // Delete user
    await prisma.user.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get all categories
export const getCategoriesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    
    // Build query
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Count total categories
    const total = await prisma.category.count({ where });
    
    // Get paginated categories with article count
    const categories = await prisma.category.findMany({
      where,
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create category
export const createCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, image } = req.body;

    // Generate slug
    const slug = slugify(name, { lower: true, strict: true });

    // Check if category with name or slug already exists
    const existingCategory = await prisma.category.findFirst({
      where: {
        OR: [
          { name },
          { slug },
        ],
      },
    });

    if (existingCategory) {
      throw new AppError('Category with this name already exists', 400);
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        image,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

// Update category
export const updateCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, image } = req.body;

    // Find category
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Generate new slug if name changed
    let slug = category.slug;
    if (name && name !== category.name) {
      slug = slugify(name, { lower: true, strict: true });
      
      // Check if slug already exists for another category
      const existingCategory = await prisma.category.findFirst({
        where: {
          slug,
          id: { not: id },
        },
      });
      
      if (existingCategory) {
        throw new AppError('Category with this name already exists', 400);
      }
    }

    // Update category
    const updatedCategory = await prisma.category.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        slug: name !== undefined ? slug : undefined,
        description: description !== undefined ? description : undefined,
        image: image !== undefined ? image : undefined,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory,
    });
  } catch (error) {
    next(error);
  }
};

// Delete category
export const deleteCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Find category
    const category = await prisma.category.findUnique({
      where: { id },
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

    // Check if category has articles
    if (category._count.articles > 0) {
      throw new AppError('Cannot delete category with articles. Please reassign articles first.', 400);
    }

    // Delete category
    await prisma.category.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get all tags
export const getTagsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    
    // Build query
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Count total tags
    const total = await prisma.tag.count({ where });
    
    // Get paginated tags with article count
    const tags = await prisma.tag.findMany({
      where,
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: tags,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create tag
export const createTagHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name } = req.body;

    // Generate slug
    const slug = slugify(name, { lower: true, strict: true });

    // Check if tag with name or slug already exists
    const existingTag = await prisma.tag.findFirst({
      where: {
        OR: [
          { name },
          { slug },
        ],
      },
    });

    if (existingTag) {
      throw new AppError('Tag with this name already exists', 400);
    }

    // Create tag
    const tag = await prisma.tag.create({
      data: {
        name,
        slug,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: tag,
    });
  } catch (error) {
    next(error);
  }
};

// Update tag
export const updateTagHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Find tag
    const tag = await prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    // Generate new slug if name changed
    let slug = tag.slug;
    if (name && name !== tag.name) {
      slug = slugify(name, { lower: true, strict: true });
      
      // Check if slug already exists for another tag
      const existingTag = await prisma.tag.findFirst({
        where: {
          slug,
          id: { not: id },
        },
      });
      
      if (existingTag) {
        throw new AppError('Tag with this name already exists', 400);
      }
    }

    // Update tag
    const updatedTag = await prisma.tag.update({
      where: { id },
      data: {
        name,
        slug,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Tag updated successfully',
      data: updatedTag,
    });
  } catch (error) {
    next(error);
  }
};

// Delete tag
export const deleteTagHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Find tag
    const tag = await prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    // Delete tag
    await prisma.tag.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Toggle trending article
export const toggleTrendingArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { isTrending } = req.body;

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Update article
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        isTrending,
      },
    });

    res.status(200).json({
      success: true,
      message: `Article ${isTrending ? 'marked as trending' : 'removed from trending'}`,
      data: updatedArticle,
    });
  } catch (error) {
    next(error);
  }
};

// Toggle breaking news
export const toggleBreakingNewsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { isBreaking } = req.body;

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Update article
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        isBreaking,
      },
    });

    res.status(200).json({
      success: true,
      message: `Article ${isBreaking ? 'marked as breaking news' : 'removed from breaking news'}`,
      data: updatedArticle,
    });
  } catch (error) {
    next(error);
  }
};

// Sync news from external API
export const syncNewsAPIHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { categories, language = Language.ENGLISH } = req.body;
    
    // Start sync process
    const result = await syncNewsFromAPI(categories, language);

    res.status(200).json({
      success: true,
      message: 'News sync completed',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};