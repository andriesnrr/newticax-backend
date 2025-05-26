import { Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';

// Bookmark article
export const bookmarkArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Check if already bookmarked
    const bookmark = await prisma.bookmark.findUnique({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    if (bookmark) {
      return res.status(200).json({
        success: true,
        message: 'Article already bookmarked',
      });
    }

    // Create bookmark
    await prisma.bookmark.create({
      data: {
        articleId,
        userId: req.user.id,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Article bookmarked successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get user bookmarks
export const getBookmarksHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { page, limit } = getPaginationParams(req);

    // Count total bookmarks
    const total = await prisma.bookmark.count({
      where: {
        userId: req.user.id,
      },
    });

    // Get bookmarks with articles
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        article: {
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
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Map to articles
    const articles = bookmarks.map(bookmark => bookmark.article);

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

// Remove bookmark
export const removeBookmarkHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    // Delete bookmark
    await prisma.bookmark.delete({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Bookmark removed successfully',
    });
  } catch (error) {
    if ((error as any).code === 'P2025') {
      // Prisma error for record not found
      return res.status(200).json({
        success: true,
        message: 'Bookmark already removed',
      });
    }
    next(error);
  }
};

// Like article
export const likeArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Check if already liked
    const like = await prisma.like.findUnique({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    if (like) {
      return res.status(200).json({
        success: true,
        message: 'Article already liked',
      });
    }

    // Create like
    await prisma.like.create({
      data: {
        articleId,
        userId: req.user.id,
      },
    });

    // Create notification for article author if not self
    if (article.authorId && article.authorId !== req.user.id) {
      await prisma.notification.create({
        data: {
          type: 'like',
          message: `${req.user.name} liked your article "${article.title}"`,
          userId: article.authorId,
          relatedId: articleId,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Article liked successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Unlike article
export const unlikeArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    // Delete like
    await prisma.like.delete({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Article unliked successfully',
    });
  } catch (error) {
    if ((error as any).code === 'P2025') {
      // Prisma error for record not found
      return res.status(200).json({
        success: true,
        message: 'Article already unliked',
      });
    }
    next(error);
  }
};

// Add comment
export const addCommentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;
    const { content, parentId } = req.body;

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // If parentId provided, check if parent comment exists
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment) {
        throw new AppError('Parent comment not found', 404);
      }
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content,
        articleId,
        userId: req.user.id,
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    // Create notification for article author if not self
    if (article.authorId && article.authorId !== req.user.id) {
      await prisma.notification.create({
        data: {
          type: 'comment',
          message: `${req.user.name} commented on your article "${article.title}"`,
          userId: article.authorId,
          relatedId: articleId,
        },
      });
    }

    // If replying to a comment, notify that user too
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        include: {
          user: true,
        },
      });

      if (parentComment && parentComment.userId !== req.user.id) {
        await prisma.notification.create({
          data: {
            type: 'reply',
            message: `${req.user.name} replied to your comment`,
            userId: parentComment.userId,
            relatedId: comment.id,
          },
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: comment,
    });
  } catch (error) {
    next(error);
  }
};

// Get article comments
export const getCommentsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { articleId } = req.params;
    const { page, limit } = getPaginationParams(req);

    // Check if article exists
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    // Get root comments (no parent)
    const total = await prisma.comment.count({
      where: {
        articleId,
        parentId: null,
      },
    });

    const rootComments = await prisma.comment.findMany({
      where: {
        articleId,
        parentId: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get replies for each root comment
    const commentsWithReplies = await Promise.all(
      rootComments.map(async (comment) => {
        const replies = await prisma.comment.findMany({
          where: {
            parentId: comment.id,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 3, // Limit to just a few replies initially
        });

        return {
          ...comment,
          replies,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: commentsWithReplies,
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

// Update comment
export const updateCommentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { commentId } = req.params;
    const { content } = req.body;

    // Find comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new AppError('Comment not found', 404);
    }

    // Check if user is the author
    if (comment.userId !== req.user.id) {
      throw new AppError('Not authorized to update this comment', 403);
    }

    // Update comment
    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      data: updatedComment,
    });
  } catch (error) {
    next(error);
  }
};

// Delete comment
export const deleteCommentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { commentId } = req.params;

    // Find comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new AppError('Comment not found', 404);
    }

    // Check if user is the author or admin
    if (comment.userId !== req.user.id && req.user.role !== 'ADMIN') {
      throw new AppError('Not authorized to delete this comment', 403);
    }

    // Delete comment
    await prisma.comment.delete({
      where: { id: commentId },
    });

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get user reading history
export const getReadingHistoryHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { page, limit } = getPaginationParams(req);

    // Count total reading history
    const total = await prisma.readHistory.count({
      where: {
        userId: req.user.id,
      },
    });

    // Get reading history with articles
    const readingHistory = await prisma.readHistory.findMany({
      where: {
        userId: req.user.id,
      },
      include: {
        article: {
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
        },
      },
      orderBy: {
        readAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Map to articles with read date
    const articles = readingHistory.map(history => ({
      ...history.article,
      readAt: history.readAt,
    }));

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