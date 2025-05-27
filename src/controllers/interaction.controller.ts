import { Response, NextFunction, Request } from 'express'; // Ditambahkan Request untuk getCommentsHandler
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { getPaginationParams } from '../utils/pagination';
import { AuthRequest } from '../types';

// Bookmark article
export const bookmarkArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => { // Eksplisitkan return type jika diinginkan
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    const bookmark = await prisma.bookmark.findUnique({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    if (bookmark) {
      res.status(200).json({ // Hapus 'return'
        success: true,
        message: 'Article already bookmarked',
      });
      return; // Tambahkan return; jika ini akhir dari cabang logika
    }

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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { page, limit } = getPaginationParams(req);

    const total = await prisma.bookmark.count({
      where: {
        userId: req.user.id,
      },
    });

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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

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
      res.status(200).json({ // Hapus 'return'
        success: true,
        message: 'Bookmark already removed',
      });
      return; // Tambahkan return;
    }
    next(error);
  }
};

// Like article
export const likeArticleHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    const like = await prisma.like.findUnique({
      where: {
        articleId_userId: {
          articleId,
          userId: req.user.id,
        },
      },
    });

    if (like) {
      res.status(200).json({ // Hapus 'return'
        success: true,
        message: 'Article already liked',
      });
      return; // Tambahkan return;
    }

    await prisma.like.create({
      data: {
        articleId,
        userId: req.user.id,
      },
    });

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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;

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
      res.status(200).json({ // Hapus 'return'
        success: true,
        message: 'Article already unliked',
      });
      return; // Tambahkan return;
    }
    next(error);
  }
};

// Add comment
export const addCommentHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { articleId } = req.params;
    const { content, parentId } = req.body;

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
      });

      if (!parentComment) {
        throw new AppError('Parent comment not found', 404);
      }
    }

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

    if (parentId) {
      const parentCommentData = await prisma.comment.findUnique({ // Ganti nama variabel agar tidak konflik
        where: { id: parentId },
        include: {
          user: true,
        },
      });

      if (parentCommentData && parentCommentData.userId !== req.user.id) {
        await prisma.notification.create({
          data: {
            type: 'reply',
            message: `${req.user.name} replied to your comment`,
            userId: parentCommentData.userId,
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
  req: Request, // Tidak menggunakan AuthRequest karena tidak ada protect middleware
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { articleId } = req.params;
    const { page, limit } = getPaginationParams(req);

    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new AppError('Article not found', 404);
    }

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
          take: 3,
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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { commentId } = req.params;
    const { content } = req.body;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new AppError('Comment not found', 404);
    }

    if (comment.userId !== req.user.id) {
      throw new AppError('Not authorized to update this comment', 403);
    }

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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { commentId } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new AppError('Comment not found', 404);
    }

    if (comment.userId !== req.user.id && req.user.role !== 'ADMIN') { // Asumsi 'ADMIN' ada di enum Role Anda
      throw new AppError('Not authorized to delete this comment', 403);
    }

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
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { page, limit } = getPaginationParams(req);

    const total = await prisma.readHistory.count({
      where: {
        userId: req.user.id,
      },
    });

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