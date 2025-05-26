import { Request, Response, NextFunction } from 'express';
import slugify from 'slugify';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';
import { fetchArticlesFromNewsAPI } from '../services/news-api.service';
import { Language, Role } from '@prisma/client';

// Get all articles with pagination
export const getArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    
    const where = {
      published: true,
      language,
    };

    // Count total articles
    const total = await prisma.article.count({ where });
    
    // Get paginated articles
    const articles = await prisma.article.findMany({
      where,
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
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.status(200).json({
      success: true,
      data: articles,
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

// Get article by slug
export const getArticleBySlugHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    
    // Get article with related data
    const article = await prisma.article.findUnique({
      where: {
        slug,
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

    // Get related articles
    const relatedArticles = await prisma.article.findMany({
      where: {
        OR: [
          { categoryId: article.categoryId },
          { 
            tags: {
              some: {
                id: {
                  in: article.tagIds,
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
      include: {
        category: true,
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

    // Check if user has bookmarked this article
    let isBookmarked = false;
    let isLiked = false;
    if (req.cookies.token) {
      try {
        // This is not ideal, but works for our case to get user from token without requiring auth
        const token = req.cookies.token;
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        
        if (payload.userId) {
          const bookmark = await prisma.bookmark.findUnique({
            where: {
              articleId_userId: {
                articleId: article.id,
                userId: payload.userId,
              },
            },
          });
          isBookmarked = !!bookmark;

          const like = await prisma.like.findUnique({
            where: {
              articleId_userId: {
                articleId: article.id,
                userId: payload.userId,
              },
            },
          });
          isLiked = !!like;
        }
      } catch (e) {
        // Ignore token parsing errors
      }
    }

    // Update view count
    await prisma.article.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
    });

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
    next(error);
  }
};

// Create new article (admin or author only)
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

    // Generate slug
    let slug = slugify(title, { lower: true, strict: true });
    
    // Check if slug exists, if so, append a unique identifier
    const existingArticle = await prisma.article.findUnique({
      where: { slug },
    });
    
    if (existingArticle) {
      slug = `${slug}-${Date.now()}`;
    }

    // Create article
    const article = await prisma.article.create({
      data: {
        title,
        slug,
        content,
        summary,
        image,
        categoryId,
        tagIds,
        authorId: req.user.id,
        language,
        isBreaking,
        isTrending,
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

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: article,
    });
  } catch (error) {
    next(error);
  }
};

// Update article (admin or author only)
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
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Check if user is the author or admin
    if (article.authorId !== req.user.id && req.user.role !== Role.ADMIN) {
      throw new AppError('Unauthorized to update this article', 403);
    }

    // Check if title changed, if so update slug
    let slug = article.slug;
    if (title && title !== article.title) {
      slug = slugify(title, { lower: true, strict: true });
      
      // Check if new slug exists
      const existingArticle = await prisma.article.findFirst({
        where: {
          slug,
          id: { not: id },
        },
      });
      
      if (existingArticle) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    // Update article
    const updatedArticle = await prisma.article.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        slug: title !== undefined ? slug : undefined,
        content: content !== undefined ? content : undefined,
        summary: summary !== undefined ? summary : undefined,
        image: image !== undefined ? image : undefined,
        categoryId: categoryId !== undefined ? categoryId : undefined,
        tagIds: tagIds !== undefined ? tagIds : undefined,
        language: language !== undefined ? language : undefined,
        isBreaking: isBreaking !== undefined ? isBreaking : undefined,
        isTrending: isTrending !== undefined ? isTrending : undefined,
        published: published !== undefined ? published : undefined,
        updatedAt: new Date(),
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

    res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: updatedArticle,
    });
  } catch (error) {
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
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Delete article
    await prisma.article.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get breaking news
export const getBreakingNewsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const language = req.query.language as Language || Language.ENGLISH;
    
    // Get breaking news articles
    const articles = await prisma.article.findMany({
      where: {
        isBreaking: true,
        published: true,
        language,
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
      take: 5,
    });

    // If no breaking news in database, fetch from News API
    if (articles.length === 0) {
      const newsApiArticles = await fetchArticlesFromNewsAPI({
        category: 'general',
        language: language === Language.INDONESIAN ? 'id' : 'en',
        pageSize: 5,
      });
      
      res.status(200).json({
        success: true,
        data: newsApiArticles,
        source: 'external',
      });
    } else {
      res.status(200).json({
        success: true,
        data: articles,
        source: 'internal',
      });
    }
  } catch (error) {
    next(error);
  }
};

// Get trending articles
export const getTrendingArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const language = req.query.language as Language || Language.ENGLISH;
    
    // First try to get articles marked as trending
    const markedTrending = await prisma.article.findMany({
      where: {
        isTrending: true,
        published: true,
        language,
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
      take: 5,
    });

    // If enough trending articles marked, return them
    if (markedTrending.length >= 5) {
      return res.status(200).json({
        success: true,
        data: markedTrending,
      });
    }

    // Otherwise, get the most viewed/liked articles
    const trendingArticles = await prisma.article.findMany({
      where: {
        published: true,
        language,
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
      take: 10,
    });

    res.status(200).json({
      success: true,
      data: trendingArticles,
    });
  } catch (error) {
    next(error);
  }
};

// Search articles
export const searchArticlesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { q, category, tag } = req.query;
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    
    if (!q && !category && !tag) {
      throw new AppError('Please provide a search query, category, or tag', 400);
    }

    // Build query
    const where: any = {
      published: true,
      language,
    };

    if (q) {
      where.OR = [
        { title: { contains: q as string, mode: 'insensitive' } },
        { content: { contains: q as string, mode: 'insensitive' } },
        { summary: { contains: q as string, mode: 'insensitive' } },
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

    // Count total articles
    const total = await prisma.article.count({ where });
    
    // Get paginated articles
    const articles = await prisma.article.findMany({
      where,
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

    // If no results from database and search term provided, fetch from News API
    if (articles.length === 0 && q) {
      const newsApiArticles = await fetchArticlesFromNewsAPI({
        q: q as string,
        language: language === Language.INDONESIAN ? 'id' : 'en',
        pageSize: limit,
        page,
      });
      
      res.status(200).json({
        success: true,
        data: newsApiArticles,
        source: 'external',
        pagination: {
          page,
          limit,
          total: newsApiArticles.length,
          pages: 1,
        },
      });
    } else {
      res.status(200).json({
        success: true,
        data: articles,
        source: 'internal',
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }
  } catch (error) {
    next(error);
  }
};

// Get articles by category
export const getArticlesByCategoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slug } = req.params;
    const { page, limit } = getPaginationParams(req);
    const language = req.query.language as Language || Language.ENGLISH;
    
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
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: true,
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

    // If no internal articles, fetch from News API
    if (articles.length === 0) {
      const newsApiArticles = await fetchArticlesFromNewsAPI({
        category: slug,
        language: language === Language.INDONESIAN ? 'id' : 'en',
        pageSize: limit,
        page,
      });
      
      res.status(200).json({
        success: true,
        data: newsApiArticles,
        category,
        source: 'external',
        pagination: {
          page,
          limit,
          total: newsApiArticles.length,
          pages: 1,
        },
      });
    } else {
      res.status(200).json({
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
      });
    }
  } catch (error) {
    next(error);
  }
};

// Get recommended articles based on user's reading history and preferences
export const getRecommendedArticlesHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    // Get user preferences
    const userPreference = await prisma.preference.findUnique({
      where: { userId: req.user.id },
    });

    // Get reading history
    const readingHistory = await prisma.readHistory.findMany({
      where: { userId: req.user.id },
      orderBy: { readAt: 'desc' },
      take: 10,
      include: {
        article: {
          include: {
            category: true,
            tags: true,
          },
        },
      },
    });

    // Extract categories and tags from reading history
    const categoryIds = readingHistory.map(history => history.article.categoryId).filter(Boolean) as string[];
    const tagIds = readingHistory.flatMap(history => history.article.tagIds);

    // Add preferred categories from user preferences
    const preferredCategoryIds = userPreference?.categories || [];
    const allCategoryIds = [...new Set([...categoryIds, ...preferredCategoryIds])];

    // Build recommendation query
    let where: any = {
      published: true,
      language: req.user.language,
    };

    if (allCategoryIds.length > 0 || tagIds.length > 0) {
      where.OR = [];
      
      if (allCategoryIds.length > 0) {
        where.OR.push({
          categoryId: {
            in: allCategoryIds,
          },
        });
      }
      
      if (tagIds.length > 0) {
        where.OR.push({
          tagIds: {
            hasSome: tagIds,
          },
        });
      }
    }

    // Exclude recently read articles
    const readArticleIds = readingHistory.map(history => history.articleId);
    if (readArticleIds.length > 0) {
      where.id = {
        notIn: readArticleIds,
      };
    }

    // Get recommended articles
    const recommendedArticles = await prisma.article.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        category: true,
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
      take: 10,
    });

    res.status(200).json({
      success: true,
      data: recommendedArticles,
    });
  } catch (error) {
    next(error);
  }
};

// Increment view count
export const incrementViewCountHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Update view count
    await prisma.article.update({
      where: { id },
      data: {
        viewCount: {
          increment: 1,
        },
      },
    });

    // Add to reading history if user is authenticated
    if (req.cookies.token) {
      try {
        const token = req.cookies.token;
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        
        if (payload.userId) {
          await prisma.readHistory.upsert({
            where: {
              articleId_userId: {
                articleId: id,
                userId: payload.userId,
              },
            },
            update: {
              readAt: new Date(),
            },
            create: {
              articleId: id,
              userId: payload.userId,
              readAt: new Date(),
            },
          });
        }
      } catch (e) {
        // Ignore token parsing errors
      }
    }

    res.status(200).json({
      success: true,
      message: 'View count updated',
    });
  } catch (error) {
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
    next(error);
  }
};
