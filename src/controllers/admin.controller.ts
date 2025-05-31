import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';
import { Role, Language } from '@prisma/client';
import { syncNewsFromAPI } from '../services/news-api.service';
import { logger } from '../utils/logger';
import { getCachedData, setCachedData } from '../utils/cache';
import { sanitizeInput } from '../utils/sanitize';
import slugify from 'slugify';

// Cache TTL for admin data
const ADMIN_CACHE_TTL = 300; // 5 minutes

// Get dashboard stats with caching
export const getDashboardStatsHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cacheKey = 'admin:dashboard:stats';
    const cachedStats = await getCachedData(cacheKey);
    
    if (cachedStats) {
      return res.status(200).json(cachedStats);
    }

    // Get counts of different entities in parallel
    const [
      userCount,
      articleCount,
      commentCount,
      categoryCount,
      totalViews,
      totalLikes,
      totalBookmarks,
      totalShares,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.article.count(),
      prisma.comment.count(),
      prisma.category.count(),
      prisma.article.aggregate({
        _sum: { viewCount: true },
      }),
      prisma.like.count(),
      prisma.bookmark.count(),
      prisma.article.aggregate({
        _sum: { shareCount: true },
      }),
    ]);

    // Get top articles by views (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topArticles = await prisma.article.findMany({
      where: {
        publishedAt: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: { viewCount: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        slug: true,
        viewCount: true,
        publishedAt: true,
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            name: true,
            username: true,
          },
        },
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
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
    });

    // Get recent users
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        provider: true,
      },
    });

    // Calculate growth metrics (last 30 days vs previous 30 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [currentPeriodUsers, previousPeriodUsers] = await Promise.all([
      prisma.user.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo,
          },
        },
      }),
    ]);

    const userGrowthRate = previousPeriodUsers > 0 
      ? ((currentPeriodUsers - previousPeriodUsers) / previousPeriodUsers) * 100 
      : 0;

    const dashboardData = {
      success: true,
      data: {
        counts: {
          users: userCount,
          articles: articleCount,
          comments: commentCount,
          categories: categoryCount,
        },
        stats: {
          totalViews: totalViews._sum.viewCount || 0,
          totalLikes: totalLikes,
          totalBookmarks: totalBookmarks,
          totalShares: totalShares._sum.shareCount || 0,
        },
        growth: {
          userGrowthRate: Math.round(userGrowthRate * 100) / 100,
          newUsersThisMonth: currentPeriodUsers,
        },
        topArticles,
        recentArticles,
        recentUsers,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Cache dashboard data
    await setCachedData(cacheKey, dashboardData, ADMIN_CACHE_TTL);

    logger.info('Dashboard stats retrieved', { 
      userId: req.user?.id,
      counts: dashboardData.data.counts,
    });

    res.status(200).json(dashboardData);
  } catch (error) {
    logger.error('Dashboard stats error', { error, userId: req.user?.id });
    next(error);
  }
};

// Get all users with enhanced filtering and search
export const getUsersHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    const role = req.query.role as Role | undefined;
    const provider = req.query.provider as string | undefined;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';
    
    // Build query
    const where: any = {};
    
    if (search) {
      const sanitizedSearch = sanitizeInput({ search }).search;
      where.OR = [
        { name: { contains: sanitizedSearch, mode: 'insensitive' } },
        { email: { contains: sanitizedSearch, mode: 'insensitive' } },
        { username: { contains: sanitizedSearch, mode: 'insensitive' } },
      ];
    }

    if (role && Object.values(Role).includes(role)) {
      where.role = role;
    }

    if (provider) {
      where.provider = provider;
    }

    // Validate sortBy field
    const allowedSortFields = ['createdAt', 'name', 'email', 'role'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    // Count total users
    const total = await prisma.user.count({ where });
    
    // Get paginated users
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        provider: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        language: true,
        _count: {
          select: {
            articles: true,
            comments: true,
            likes: true,
            bookmarks: true,
          },
        },
      },
      orderBy: {
        [finalSortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    logger.info('Users list retrieved', {
      userId: req.user?.id,
      total,
      filters: { search, role, provider },
    });

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        search,
        role,
        provider,
        sortBy: finalSortBy,
        sortOrder,
      },
    });
  } catch (error) {
    logger.error('Get users error', { error, userId: req.user?.id });
    next(error);
  }
};

// Update user role with validation and logging
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
      throw new AppError('Invalid role provided', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Prevent demoting the last admin
    if (user.role === Role.ADMIN && role !== Role.ADMIN) {
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN },
      });

      if (adminCount <= 1) {
        throw new AppError('Cannot demote the last admin user', 400);
      }
    }

    // Prevent users from changing their own role
    if (user.id === req.user?.id) {
      throw new AppError('You cannot change your own role', 400);
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        provider: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('User role updated', {
      targetUserId: id,
      targetUserEmail: user.email,
      oldRole: user.role,
      newRole: role,
      updatedBy: req.user?.id,
    });
    
    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: updatedUser,
    });
  } catch (error) {
    logger.error('Update user role error', { error, userId: req.user?.id, targetId: req.params.id });
    next(error);
  }
};

// Delete user with enhanced validation
export const deleteUserHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new AppError('User ID is required', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        _count: {
          select: {
            articles: true,
            comments: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Prevent users from deleting themselves
    if (user.id === req.user?.id) {
      throw new AppError('You cannot delete your own account', 400);
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

    // Check if user has content that needs to be handled
    if (user._count.articles > 0) {
      // You might want to reassign articles to another user or mark them as orphaned
      throw new AppError(`User has ${user._count.articles} articles. Please reassign or delete articles first.`, 400);
    }

    // Delete user (this will cascade to related records based on your schema)
    await prisma.user.delete({
      where: { id },
    });

    logger.info('User deleted', {
      deletedUserId: id,
      deletedUserEmail: user.email,
      deletedBy: req.user?.id,
      hadArticles: user._count.articles,
      hadComments: user._count.comments,
    });

    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    logger.error('Delete user error', { error, userId: req.user?.id, targetId: req.params.id });
    next(error);
  }
};

// Get all categories with enhanced features
export const getCategoriesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string || 'name';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'asc';
    
    // Build query
    const where: any = {};
    if (search) {
      const sanitizedSearch = sanitizeInput({ search }).search;
      where.OR = [
        { name: { contains: sanitizedSearch, mode: 'insensitive' } },
        { slug: { contains: sanitizedSearch, mode: 'insensitive' } },
        { description: { contains: sanitizedSearch, mode: 'insensitive' } },
      ];
    }

    // Validate sortBy field
    const allowedSortFields = ['name', 'createdAt', 'slug'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';

    // Count total categories
    const total = await prisma.category.count({ where });
    
    // Get paginated categories with article count and latest article
    const categories = await prisma.category.findMany({
      where,
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
        articles: {
          where: { published: true },
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            title: true,
            publishedAt: true,
          },
        },
      },
      orderBy: {
        [finalSortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform data to include latest article info
    const transformedCategories = categories.map(category => ({
      ...category,
      latestArticle: category.articles[0] || null,
      articles: undefined, // Remove the articles array from response
    }));

    res.status(200).json({
      success: true,
      data: transformedCategories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Get categories error', { error });
    next(error);
  }
};

// Create category with enhanced validation
export const createCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, image } = req.body;

    if (!name || name.trim().length === 0) {
      throw new AppError('Category name is required', 400);
    }

    if (name.length < 2 || name.length > 50) {
      throw new AppError('Category name must be between 2 and 50 characters', 400);
    }

    if (description && description.length > 200) {
      throw new AppError('Description must be less than 200 characters', 400);
    }

    // Sanitize inputs
    const sanitizedData = sanitizeInput({
      name: name.trim(),
      description: description?.trim() || '',
    });

    // Generate slug
    const slug = slugify(sanitizedData.name, { lower: true, strict: true });

    // Check if category with name or slug already exists
    const existingCategory = await prisma.category.findFirst({
      where: {
        OR: [
          { name: { equals: sanitizedData.name, mode: 'insensitive' } },
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
        name: sanitizedData.name,
        slug,
        description: sanitizedData.description || null,
        image,
      },
    });

    logger.info('Category created', {
      categoryId: category.id,
      categoryName: category.name,
      createdBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    logger.error('Create category error', { error, userId: req.user?.id });
    next(error);
  }
};

// Update category with enhanced validation
export const updateCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, image } = req.body;

    if (!id) {
      throw new AppError('Category ID is required', 400);
    }

    // Find category
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Validate inputs
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        throw new AppError('Category name cannot be empty', 400);
      }
      if (name.length < 2 || name.length > 50) {
        throw new AppError('Category name must be between 2 and 50 characters', 400);
      }
    }

    if (description !== undefined && description && description.length > 200) {
      throw new AppError('Description must be less than 200 characters', 400);
    }

    // Prepare update data
    const updateData: any = {};
    
    if (name !== undefined) {
      const sanitizedName = sanitizeInput({ name: name.trim() }).name;
      updateData.name = sanitizedName;
      
      // Generate new slug if name changed
      if (sanitizedName !== category.name) {
        const newSlug = slugify(sanitizedName, { lower: true, strict: true });
        
        // Check if slug already exists for another category
        const existingCategory = await prisma.category.findFirst({
          where: {
            OR: [
              { name: { equals: sanitizedName, mode: 'insensitive' } },
              { slug: newSlug },
            ],
            id: { not: id },
          },
        });
        
        if (existingCategory) {
          throw new AppError('Category with this name already exists', 400);
        }
        
        updateData.slug = newSlug;
      }
    }

    if (description !== undefined) {
      updateData.description = description ? sanitizeInput({ description: description.trim() }).description : null;
    }

    if (image !== undefined) {
      updateData.image = image;
    }

    // Update category
    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    logger.info('Category updated', {
      categoryId: id,
      updatedFields: Object.keys(updateData),
      updatedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: updatedCategory,
    });
  } catch (error) {
    logger.error('Update category error', { error, categoryId: req.params.id, userId: req.user?.id });
    next(error);
  }
};

// Delete category with enhanced validation
export const deleteCategoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new AppError('Category ID is required', 400);
    }

    // Find category with article count
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
      throw new AppError(`Cannot delete category with ${category._count.articles} articles. Please reassign articles first.`, 400);
    }

    // Delete category
    await prisma.category.delete({
      where: { id },
    });

    logger.info('Category deleted', {
      categoryId: id,
      categoryName: category.name,
      deletedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    logger.error('Delete category error', { error, categoryId: req.params.id, userId: req.user?.id });
    next(error);
  }
};

// Get all tags with enhanced features
export const getTagsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string || 'name';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'asc';
    
    // Build query
    const where: any = {};
    if (search) {
      const sanitizedSearch = sanitizeInput({ search }).search;
      where.OR = [
        { name: { contains: sanitizedSearch, mode: 'insensitive' } },
        { slug: { contains: sanitizedSearch, mode: 'insensitive' } },
      ];
    }

    // Validate sortBy field
    const allowedSortFields = ['name', 'createdAt'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';

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
        [finalSortBy]: sortOrder,
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
    logger.error('Get tags error', { error });
    next(error);
  }
};

// Create tag with enhanced validation
export const createTagHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      throw new AppError('Tag name is required', 400);
    }

    if (name.length < 2 || name.length > 30) {
      throw new AppError('Tag name must be between 2 and 30 characters', 400);
    }

    // Sanitize input
    const sanitizedName = sanitizeInput({ name: name.trim() }).name;

    // Generate slug
    const slug = slugify(sanitizedName, { lower: true, strict: true });

    // Check if tag with name or slug already exists
    const existingTag = await prisma.tag.findFirst({
      where: {
        OR: [
          { name: { equals: sanitizedName, mode: 'insensitive' } },
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
        name: sanitizedName,
        slug,
      },
    });

    logger.info('Tag created', {
      tagId: tag.id,
      tagName: tag.name,
      createdBy: req.user?.id,
    });

    res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: tag,
    });
  } catch (error) {
    logger.error('Create tag error', { error, userId: req.user?.id });
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

    if (!id) {
      throw new AppError('Tag ID is required', 400);
    }

    if (!name || name.trim().length === 0) {
      throw new AppError('Tag name is required', 400);
    }

    if (name.length < 2 || name.length > 30) {
      throw new AppError('Tag name must be between 2 and 30 characters', 400);
    }

    // Find tag
    const tag = await prisma.tag.findUnique({
      where: { id },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    // Sanitize input
    const sanitizedName = sanitizeInput({ name: name.trim() }).name;

    // Generate new slug if name changed
    let slug = tag.slug;
    if (sanitizedName !== tag.name) {
      slug = slugify(sanitizedName, { lower: true, strict: true });
      
      // Check if slug already exists for another tag
      const existingTag = await prisma.tag.findFirst({
        where: {
          OR: [
            { name: { equals: sanitizedName, mode: 'insensitive' } },
            { slug },
          ],
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
        name: sanitizedName,
        slug,
      },
    });

    logger.info('Tag updated', {
      tagId: id,
      oldName: tag.name,
      newName: sanitizedName,
      updatedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'Tag updated successfully',
      data: updatedTag,
    });
  } catch (error) {
    logger.error('Update tag error', { error, tagId: req.params.id, userId: req.user?.id });
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

    if (!id) {
      throw new AppError('Tag ID is required', 400);
    }

    // Find tag
    const tag = await prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
    });

    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    // Delete tag (articles will be updated to remove this tag from their tagIds)
    await prisma.tag.delete({
      where: { id },
    });

    logger.info('Tag deleted', {
      tagId: id,
      tagName: tag.name,
      articleCount: tag._count.articles,
      deletedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    logger.error('Delete tag error', { error, tagId: req.params.id, userId: req.user?.id });
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

    if (typeof isTrending !== 'boolean') {
      throw new AppError('isTrending must be a boolean value', 400);
    }

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isTrending: true,
        author: {
          select: { name: true },
        },
      },
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
      select: {
        id: true,
        title: true,
        isTrending: true,
        isBreaking: true,
        publishedAt: true,
      },
    });

    logger.info('Article trending status updated', {
      articleId: id,
      articleTitle: article.title,
      oldStatus: article.isTrending,
      newStatus: isTrending,
      updatedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: `Article ${isTrending ? 'marked as trending' : 'removed from trending'}`,
      data: updatedArticle,
    });
  } catch (error) {
    logger.error('Toggle trending article error', { error, articleId: req.params.id, userId: req.user?.id });
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

    if (typeof isBreaking !== 'boolean') {
      throw new AppError('isBreaking must be a boolean value', 400);
    }

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isBreaking: true,
        author: {
          select: { name: true },
        },
      },
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
      select: {
        id: true,
        title: true,
        isTrending: true,
        isBreaking: true,
        publishedAt: true,
      },
    });

    logger.info('Article breaking status updated', {
      articleId: id,
      articleTitle: article.title,
      oldStatus: article.isBreaking,
      newStatus: isBreaking,
      updatedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: `Article ${isBreaking ? 'marked as breaking news' : 'removed from breaking news'}`,
      data: updatedArticle,
    });
  } catch (error) {
    logger.error('Toggle breaking news error', { error, articleId: req.params.id, userId: req.user?.id });
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
    const { categories = ['general'], language = Language.ENGLISH } = req.body;
    
    // Validate input
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new AppError('Categories must be a non-empty array', 400);
    }

    if (categories.length > 10) {
      throw new AppError('Maximum 10 categories allowed per sync', 400);
    }

    if (!Object.values(Language).includes(language)) {
      throw new AppError('Invalid language specified', 400);
    }

    logger.info('News sync started', {
      categories,
      language,
      initiatedBy: req.user?.id,
    });
    
    // Start sync process
    const result = await syncNewsFromAPI(categories, language);

    logger.info('News sync completed', {
      result,
      categories,
      language,
      initiatedBy: req.user?.id,
    });

    res.status(200).json({
      success: true,
      message: 'News sync completed',
      data: result,
    });
  } catch (error) {
    logger.error('News sync error', { error, userId: req.user?.id, body: req.body });
    next(error);
  }
};