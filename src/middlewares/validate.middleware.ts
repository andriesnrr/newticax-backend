import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errorHandler';

// Validate registration input
export const validateRegister = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return next(new AppError('Name, email, and password are required', 400));
  }
  
  if (name.length < 2) {
    return next(new AppError('Name must be at least 2 characters', 400));
  }
  
  if (password.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Please provide a valid email address', 400));
  }

  next();
};

// Validate login input
export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  next();
};

// Validate profile update
export const validateProfileUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, bio, image } = req.body;

  if (!name && !bio && !image) {
    return next(new AppError('At least one field (name, bio, or image) is required', 400));
  }

  if (name && name.length < 2) {
    return next(new AppError('Name must be at least 2 characters', 400));
  }

  next();
};

// Validate password update
export const validatePasswordUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Current password and new password are required', 400));
  }

  if (newPassword.length < 6) {
    return next(new AppError('New password must be at least 6 characters', 400));
  }

  next();
};

// Validate article creation
export const validateArticleCreate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { title, content, summary, categoryId } = req.body;

  if (!title || !content || !summary) {
    return next(new AppError('Title, content, and summary are required', 400));
  }

  if (title.length < 5) {
    return next(new AppError('Title must be at least 5 characters', 400));
  }

  if (content.length < 100) {
    return next(new AppError('Content must be at least 100 characters', 400));
  }

  if (summary.length < 20 || summary.length > 300) {
    return next(new AppError('Summary must be between 20 and 300 characters', 400));
  }

  next();
};

// Validate article update
export const validateArticleUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { title, content, summary } = req.body;

  if (title && title.length < 5) {
    return next(new AppError('Title must be at least 5 characters', 400));
  }

  if (content && content.length < 100) {
    return next(new AppError('Content must be at least 100 characters', 400));
  }

  if (summary && (summary.length < 20 || summary.length > 300)) {
    return next(new AppError('Summary must be between 20 and 300 characters', 400));
  }

  next();
};

// Validate comment
export const validateComment = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { content } = req.body;

  if (!content) {
    return next(new AppError('Comment content is required', 400));
  }

  if (content.length < 2 || content.length > 1000) {
    return next(new AppError('Comment must be between 2 and 1000 characters', 400));
  }

  next();
};

// Validate category
export const validateCategory = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name } = req.body;

  if (!name) {
    return next(new AppError('Category name is required', 400));
  }

  if (name.length < 2) {
    return next(new AppError('Category name must be at least 2 characters', 400));
  }

  next();
};

// Validate tag
export const validateTag = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name } = req.body;

  if (!name) {
    return next(new AppError('Tag name is required', 400));
  }

  if (name.length < 2) {
    return next(new AppError('Tag name must be at least 2 characters', 400));
  }

  next();
};