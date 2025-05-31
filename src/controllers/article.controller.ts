import { Request, Response, NextFunction } from 'express';
import slugify from 'slugify';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';
import { fetchArticlesFromNewsAPI } from '../services/news-api.service';
import { Language, Role } from '@prisma/client';
import { logger } from '../utils/logger';
import { getCachedData, setCachedData } from '../utils/cache';
import { sanitizeInput } from '../utils/sanitize';

// Cache TTL constants
const CACHE_TTL = {
  ARTICLES: 300, // 5 minutes
  TRENDING: 600, // 10 minutes
  BREAKING: 300, // 5 minutes
  SEARCH: 900, // 15 minutes
};

// Get all articles with pagination and caching
export const getArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    const categoryId = req.query.categoryId as string;
    const featured = req.query.featured === 'true';
    
    // Create cache key
    const cacheKey = `articles:${page}:${limit}:${language}:${categoryId || 'all'}:${featured}`;
    
    // Try to get from cache first
    const cachedData = await getCachedData(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    const where: any = {
      published: true,
      language,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (featured) {
      where.OR = [
        { isTrending: true },
        { isBreaking: true },
      ];
    }

    // Count total articles
    const total = await prisma.article.count({ where });
    
    // Get paginated articles with optimized select
    const articles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        source: true,
        isExternal: true,
        isBreaking: true,
        isTrending: true,
        publishedAt: true,
        viewCount: true,
        shareCount: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        tags: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
      },
      orderBy: [
        { isBreaking: 'desc' },
        { publishedAt: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    const response = {
      success: true,
      data: articles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };

    // Cache the response
    await setCachedData(cacheKey, response, CACHE_TTL.ARTICLES);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get articles error', { error, query: req.query });
    next(error);
  }
};

// Get article by slug with enhanced caching and analytics
export const getArticleBySlugHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    
    if (!slug || typeof slug !== 'string') {
      throw new AppError('Invalid article slug', 400);
    }

    // Sanitize slug
    const sanitizedSlug = slug.toLowerCase().trim();

    // Cache key for article
    const cacheKey = `article:${sanitizedSlug}`;
    const cachedArticle = await getCachedData(cacheKey);
    
    let article;
    if (cachedArticle) {
      article = cachedArticle;
    } else {
      // Get article with related data
      article = await prisma.article.findUnique({
        where: {
          slug: sanitizedSlug,
          published: true,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              bio: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
          tags: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
              bookmarks: true,
            },
          },
        },
      });

      if (!article) {
        throw new AppError('Article not found', 404);
      }

      // Cache article for 10 minutes
      await setCachedData(cacheKey, article, 600);
    }

    // Get related articles with caching
    const relatedCacheKey = `related:${article.id}`;
    let relatedArticles = await getCachedData(relatedCacheKey);
    
    if (!relatedArticles) {
      relatedArticles = await prisma.article.findMany({
        where: {
          OR: [
            { categoryId: article.categoryId },
            { 
              tags: {
                some: {
                  id: {
                    in: article.tagIds || [],
                  },
                },
              },
            },
          ],
          NOT: {
            id: article.id,
          },
          published: true,
          language: article.language,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          image: true,
          publishedAt: true,
          viewCount: true,
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: 4,
      });

      await setCachedData(relatedCacheKey, relatedArticles, 900); // 15 minutes
    }

    // Check user interactions if authenticated
    let isBookmarked = false;
    let isLiked = false;
    let userId = null;

    if (req.cookies.token) {
      try {
        const token = req.cookies.token;
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userId = payload.userId;
        
        if (userId) {
          const [bookmark, like] = await Promise.all([
            prisma.bookmark.findUnique({
              where: {
                articleId_userId: {
                  articleId: article.id,
                  userId,
                },
              },
            }),
            prisma.like.findUnique({
              where: {
                articleId_userId: {
                  articleId: article.id,
                  userId,
                },
              },
            }),
          ]);

          isBookmarked = !!bookmark;
          isLiked = !!like;
        }
      } catch (e) {
        // Ignore token parsing errors
        logger.warn('Token parsing error in article view', { error: e, slug: sanitizedSlug });
      }
    }

    // Update view count asynchronously
    prisma.article.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
    }).catch(error => {
      logger.error('Error updating view count', { error, articleId: article.id });
    });

    // Add to reading history if user is authenticated
    if (userId) {
      prisma.readHistory.upsert({
        where: {
          articleId_userId: {
            articleId: article.id,
            userId,
          },
        },
        update: {
          readAt: new Date(),
        },
        create: {
          articleId: article.id,
          userId,
          readAt: new Date(),
        },
      }).catch(error => {
        logger.error('Error updating reading history', { error, articleId: article.id, userId });
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...article,
        isBookmarked,
        isLiked,
        relatedArticles,
      },
    });
  } catch (error) {
    logger.error('Get article by slug error', { error, slug: req.params.slug });
    next(error);
  }
};

// Create new article with enhanced validation
export const createArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const {
      title,
      content,
      summary,
      image,
      categoryId,
      tagIds = [],
      language = Language.ENGLISH,
      isBreaking = false,
      isTrending = false,
      published = true,
    } = req.body;

    // Enhanced validation
    if (!title || !content || !summary) {
      throw new AppError('Title, content, and summary are required', 400);
    }

    if (title.length < 10 || title.length > 200) {
      throw new AppError('Title must be between 10 and 200 characters', 400);
    }

    if (content.length < 100) {
      throw new AppError('Content must be at least 100 characters', 400);
    }

    if (summary.length < 50 || summary.length > 500) {
      throw new AppError('Summary must be between 50 and 500 characters', 400);
    }

    // Sanitize inputs
    const sanitizedData = sanitizeInput({
      title: title.trim(),
      content: content.trim(),
      summary: summary.trim(),
    });

    // Validate category if provided
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
      });
      if (!category) {
        throw new AppError('Invalid category selected', 400);
      }
    }

    // Validate tags if provided
    if (tagIds.length > 0) {
      const validTags = await prisma.tag.findMany({
        where: { id: { in: tagIds } },
      });
      if (validTags.length !== tagIds.length) {
        throw new AppError('One or more invalid tags selected', 400);
      }
    }

    // Generate unique slug
    let slug = slugify(sanitizedData.title, { lower: true, strict: true });
    
    const existingArticle = await prisma.article.findUnique({
      where: { slug },
    });
    
    if (existingArticle) {
      slug = `${slug}-${Date.now()}`;
    }

    // Only admins can mark articles as breaking or trending
    const finalIsBreaking = req.user.role === Role.ADMIN ? isBreaking : false;
    const finalIsTrending = req.user.role === Role.ADMIN ? isTrending : false;

    // Create article
    const article = await prisma.article.create({
      data: {
        title: sanitizedData.title,
        slug,
        content: sanitizedData.content,
        summary: sanitizedData.summary,
        image,
        categoryId,
        tagIds,
        authorId: req.user.id,
        language,
        isBreaking: finalIsBreaking,
        isTrending: finalIsTrending,
        published,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: true,
        tags: true,
      },
    });

    // Clear related caches
    const cacheKeys = [
      `articles:*`,
      `trending:${language}`,
      `breaking:${language}`,
    ];
    
    // Note: You'll need to implement cache clearing logic
    // This is a placeholder for cache invalidation

    logger.info('Article created', {
      articleId: article.id,
      authorId: req.user.id,
      title: article.title,
      published,
    });

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: article,
    });
  } catch (error) {
    logger.error('Create article error', { error, userId: req.user?.id });
    next(error);
  }
};

// Get breaking news with fallback to external API
export const getBreakingNewsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const language = req.query.language as Language || Language.ENGLISH;
    const limit = parseInt(req.query.limit as string) || 5;
    
    const cacheKey = `breaking:${language}:${limit}`;
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // Get breaking news articles from database
    const articles = await prisma.article.findMany({
      where: {
        isBreaking: true,
        published: true,
        language,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        publishedAt: true,
        source: true,
        isExternal: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: limit,
    });

    let response;

    // If no breaking news in database, fetch from News API
    if (articles.length === 0) {
      try {
        const newsApiArticles = await fetchArticlesFromNewsAPI({
          category: 'general',
          language: language === Language.INDONESIAN ? 'id' : 'en',
          pageSize: limit,
        });
        
        response = {
          success: true,
          data: newsApiArticles.slice(0, limit),
          source: 'external',
        };
      } catch (apiError) {
        logger.error('NewsAPI fetch error for breaking news', { error: apiError });
        response = {
          success: true,
          data: [],
          source: 'external',
          message: 'No breaking news available at the moment',
        };
      }
    } else {
      response = {
        success: true,
        data: articles,
        source: 'internal',
      };
    }

    // Cache the response
    await setCachedData(cacheKey, response, CACHE_TTL.BREAKING);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get breaking news error', { error });
    next(error);
  }
};

// Get trending articles with intelligent fallback
export const getTrendingArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const language = req.query.language as Language || Language.ENGLISH;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const cacheKey = `trending:${language}:${limit}`;
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // First try to get articles manually marked as trending
    const markedTrending = await prisma.article.findMany({
      where: {
        isTrending: true,
        published: true,
        language,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        publishedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: limit,
    });

    let response;

    // If enough trending articles marked, return them
    if (markedTrending.length >= Math.min(limit, 5)) {
      response = {
        success: true,
        data: markedTrending,
        source: 'curated',
      };
    } else {
      // Otherwise, get the most viewed/liked articles from the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const trendingArticles = await prisma.article.findMany({
        where: {
          published: true,
          language,
          publishedAt: {
            gte: sevenDaysAgo,
          },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          image: true,
          publishedAt: true,
          viewCount: true,
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
        orderBy: [
          { viewCount: 'desc' },
          { publishedAt: 'desc' },
        ],
        take: limit,
      });

      response = {
        success: true,
        data: trendingArticles,
        source: 'algorithmic',
      };
    }

    // Cache the response
    await setCachedData(cacheKey, response, CACHE_TTL.TRENDING);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get trending articles error', { error });
    next(error);
  }
};

// Enhanced search with caching and external API fallback
export const searchArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q, category, tag, author } = req.query;
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    
    if (!q && !category && !tag && !author) {
      throw new AppError('Please provide a search query, category, tag, or author', 400);
    }

    // Create cache key based on search parameters
    const cacheKey = `search:${JSON.stringify({ q, category, tag, author, page, limit, language })}`;
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // Build search query
    const where: any = {
      published: true,
      language,
    };

    if (q) {
      const sanitizedQuery = sanitizeInput({ q: q as string }).q;
      where.OR = [
        { title: { contains: sanitizedQuery, mode: 'insensitive' } },
        { content: { contains: sanitizedQuery, mode: 'insensitive' } },
        { summary: { contains: sanitizedQuery, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = {
        slug: category as string,
      };
    }

    if (tag) {
      where.tags = {
        some: {
          slug: tag as string,
        },
      };
    }

    if (author) {
      where.author = {
        username: author as string,
      };
    }

    // Count total articles
    const total = await prisma.article.count({ where });
    
    // Get paginated articles
    const articles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        publishedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        tags: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    let response;

    // If no results from database and search term provided, fetch from News API
    if (articles.length === 0 && q) {
      try {
        const newsApiArticles = await fetchArticlesFromNewsAPI({
          q: q as string,
          language: language === Language.INDONESIAN ? 'id' : 'en',
          pageSize: limit,
          page,
        });
        
        response = {
          success: true,
          data: newsApiArticles,
          source: 'external',
          pagination: {
            page,
            limit,
            total: newsApiArticles.length,
            pages: Math.ceil(newsApiArticles.length / limit),
          },
        };
      } catch (apiError) {
        logger.error('NewsAPI search error', { error: apiError, query: q });
        response = {
          success: true,
          data: [],
          source: 'external',
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
          },
          message: 'No search results found',
        };
      }
    } else {
      response = {
        success: true,
        data: articles,
        source: 'internal',
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    }

    // Cache search results
    await setCachedData(cacheKey, response, CACHE_TTL.SEARCH);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Search articles error', { error, query: req.query });
    next(error);
  }
};

// Update article with enhanced validation and authorization
export const updateArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { id } = req.params;
    const {
      title,
      content,
      summary,
      image,
      categoryId,
      tagIds,
      language,
      isBreaking,
      isTrending,
      published,
    } = req.body;

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true },
        },
      },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Check authorization
    if (article.authorId !== req.user.id && req.user.role !== Role.ADMIN) {
      throw new AppError('Unauthorized to update this article', 403);
    }

    // Validate inputs if provided
    if (title && (title.length < 10 || title.length > 200)) {
      throw new AppError('Title must be between 10 and 200 characters', 400);
    }

    if (content && content.length < 100) {
      throw new AppError('Content must be at least 100 characters', 400);
    }

    if (summary && (summary.length < 50 || summary.length > 500)) {
      throw new AppError('Summary must be between 50 and 500 characters', 400);
    }

    // Sanitize inputs
    const updateData: any = {};
    
    if (title) {
      updateData.title = sanitizeInput({ title: title.trim() }).title;
      // Update slug if title changed
      updateData.slug = slugify(updateData.title, { lower: true, strict: true });
      
      // Check if new slug exists
      const existingArticle = await prisma.article.findFirst({
        where: {
          slug: updateData.slug,
          id: { not: id },
        },
      });
      
      if (existingArticle) {
        updateData.slug = `${updateData.slug}-${Date.now()}`;
      }
    }

    if (content) updateData.content = sanitizeInput({ content: content.trim() }).content;
    if (summary) updateData.summary = sanitizeInput({ summary: summary.trim() }).summary;
    if (image !== undefined) updateData.image = image;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (tagIds !== undefined) updateData.tagIds = tagIds;
    if (language !== undefined) updateData.language = language;
    if (published !== undefined) updateData.published = published;

    // Only admins can update breaking/trending status
    if (req.user.role === Role.ADMIN) {
      if (isBreaking !== undefined) updateData.isBreaking = isBreaking;
      if (isTrending !== undefined) updateData.isTrending = isTrending;
    }

    updateData.updatedAt = new Date();

    // Update article
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: true,
        tags: true,
      },
    });

    // Clear related caches
    // Implementation depends on your cache strategy

    logger.info('Article updated', {
      articleId: id,
      updatedBy: req.user.id,
      updatedFields: Object.keys(updateData),
    });

    res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: updatedArticle,
    });
  } catch (error) {
    logger.error('Update article error', { error, articleId: req.params.id, userId: req.user?.id });
    next(error);
  }
};

// Delete article (admin only)
export const deleteArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { id } = req.params;

    // Find article
    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        authorId: true,
        author: {
          select: { name: true },
        },
      },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Delete article (this will cascade to related records)
    await prisma.article.delete({
      where: { id },
    });

    logger.info('Article deleted', {
      articleId: id,
      articleTitle: article.title,
      deletedBy: req.user.id,
      originalAuthor: article.authorId,
    });

    res.status(200).json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error) {
    logger.error('Delete article error', { error, articleId: req.params.id, userId: req.user?.id });
    next(error);
  }
};

// Get articles by category with caching
export const getArticlesByCategoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    
    if (!slug) {
      throw new AppError('Category slug is required', 400);
    }

    const cacheKey = `category:${slug}:${page}:${limit}:${language}`;
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // Find category
    const category = await prisma.category.findUnique({
      where: { slug },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    // Count total articles
    const total = await prisma.article.count({
      where: {
        categoryId: category.id,
        published: true,
        language,
      },
    });
    
    // Get paginated articles
    const articles = await prisma.article.findMany({
      where: {
        categoryId: category.id,
        published: true,
        language,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        publishedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    let response;

    // If no internal articles, fetch from News API
    if (articles.length === 0) {
      try {
        const newsApiArticles = await fetchArticlesFromNewsAPI({
          category: slug,
          language: language === Language.INDONESIAN ? 'id' : 'en',
          pageSize: limit,
          page,
        });
        
        response = {
          success: true,
          data: newsApiArticles,
          category,
          source: 'external',
          pagination: {
            page,
            limit,
            total: newsApiArticles.length,
            pages: Math.ceil(newsApiArticles.length / limit),
          },
        };
      } catch (apiError) {
        logger.error('NewsAPI category fetch error', { error: apiError, category: slug });
        response = {
          success: true,
          data: [],
          category,
          source: 'external',
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        };
      }
    } else {
      response = {
        success: true,
        data: articles,
        category,
        source: 'internal',
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    }

    // Cache the response
    await setCachedData(cacheKey, response, CACHE_TTL.ARTICLES);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get articles by category error', { error, slug: req.params.slug });
    next(error);
  }
};

// Get recommended articles with enhanced algorithm
export const getRecommendedArticlesHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const cacheKey = `recommended:${req.user.id}:${limit}`;
    const cachedData = await getCachedData(cacheKey);
    
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // Get user preferences and reading history
    const [userPreference, readingHistory] = await Promise.all([
      prisma.preference.findUnique({
        where: { userId: req.user.id },
      }),
      prisma.readHistory.findMany({
        where: { userId: req.user.id },
        orderBy: { readAt: 'desc' },
        take: 20,
        include: {
          article: {
            select: {
              categoryId: true,
              tagIds: true,
              language: true,
            },
          },
        },
      }),
    ]);

    // Extract categories and tags from reading history
    const readCategoryIds = readingHistory
      .map(history => history.article.categoryId)
      .filter(Boolean) as string[];
    
    const readTagIds = readingHistory
      .flatMap(history => history.article.tagIds || []);

    // Combine with user preferences
    const preferredCategoryIds = userPreference?.categories || [];
    const allCategoryIds = [...new Set([...readCategoryIds, ...preferredCategoryIds])];

    // Build recommendation query with scoring
    let where: any = {
      published: true,
      language: req.user.language,
    };

    // Exclude recently read articles
    const readArticleIds = readingHistory.map(history => history.articleId);
    if (readArticleIds.length > 0) {
      where.id = {
        notIn: readArticleIds,
      };
    }

    // Create scoring query for recommendations
    if (allCategoryIds.length > 0 || readTagIds.length > 0) {
      where.OR = [];
      
      if (allCategoryIds.length > 0) {
        where.OR.push({
          categoryId: {
            in: allCategoryIds,
          },
        });
      }
      
      if (readTagIds.length > 0) {
        where.OR.push({
          tagIds: {
            hasSome: readTagIds,
          },
        });
      }
    }

    // Get recommended articles
    const recommendedArticles = await prisma.article.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        publishedAt: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        tags: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: [
        { publishedAt: 'desc' },
        { viewCount: 'desc' },
      ],
      take: limit,
    });

    const response = {
      success: true,
      data: recommendedArticles,
    };

    // Cache recommendations for 30 minutes
    await setCachedData(cacheKey, response, 1800);

    res.status(200).json(response);
  } catch (error) {
    logger.error('Get recommended articles error', { error, userId: req.user?.id });
    next(error);
  }
};

// Increment view count with rate limiting
export const incrementViewCountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new AppError('Article ID is required', 400);
    }

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Update view count
    await prisma.article.update({
      where: { id },
      data: {
        viewCount: {
          increment: 1,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'View count updated',
    });
  } catch (error) {
    logger.error('Increment view count error', { error, articleId: req.params.id });
    next(error);
  }
};

// Increment share count
export const incrementShareCountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new AppError('Article ID is required', 400);
    }

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id },
      select: { id: true, title: true },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Update share count
    await prisma.article.update({
      where: { id },
      data: {
        shareCount: {
          increment: 1,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Share count updated',
    });
  } catch (error) {
    logger.error('Increment share count error', { error, articleId: req.params.id });
    next(error);
  }
};