import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errorHandler';

// Validate registration input - FIXED VERSION
export const validateRegister = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { name, email, password, username } = req.body;

  // Check all required fields (username is now required)
  if (!name || !email || !password || !username) {
    return next(new AppError('Name, email, username, and password are required', 400));
  }
  
  // Validate name
  if (name.length < 2) {
    return next(new AppError('Name must be at least 2 characters', 400));
  }

  // Validate username
  if (username.length < 3 || username.length > 30) {
    return next(new AppError('Username must be between 3 and 30 characters', 400));
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return next(new AppError('Username can only contain letters, numbers, and underscores', 400));
  }
  
  // Validate password - updated to match controller requirements
  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters', 400));
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    return next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
  }

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Please provide a valid email address', 400));
  }

  next();
};

// Validate login input - improved validation
export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log('🧾 [validateLogin] req.body:', req.body);
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and password are required', 400));
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Please provide a valid email address', 400));
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

  if (!name && !bio && image === undefined) {
    return next(new AppError('At least one field (name, bio, or image) is required', 400));
  }

  if (name && name.length < 2) {
    return next(new AppError('Name must be at least 2 characters', 400));
  }

  if (bio && bio.length > 500) {
    return next(new AppError('Bio must be less than 500 characters', 400));
  }

  next();
};

// Validate password update - improved to match controller
export const validatePasswordUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Current password and new password are required', 400));
  }

  // Apply same password rules as registration
  if (newPassword.length < 8) {
    return next(new AppError('New password must be at least 8 characters', 400));
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
    return next(new AppError('New password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
  }

  if (currentPassword === newPassword) {
    return next(new AppError('New password must be different from current password', 400));
  }

  next();
};

// Validate article creation
export const validateArticleCreate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { title, content, summary } = req.body;

  if (!title || !content || !summary) {
    return next(new AppError('Title, content, and summary are required', 400));
  }

  if (title.length < 10) {
    return next(new AppError('Title must be at least 10 characters', 400));
  }

  if (title.length > 200) {
    return next(new AppError('Title must be less than 200 characters', 400));
  }

  if (content.length < 100) {
    return next(new AppError('Content must be at least 100 characters', 400));
  }

  if (summary.length < 50 || summary.length > 500) {
    return next(new AppError('Summary must be between 50 and 500 characters', 400));
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

  if (title && (title.length < 10 || title.length > 200)) {
    return next(new AppError('Title must be between 10 and 200 characters', 400));
  }

  if (content && content.length < 100) {
    return next(new AppError('Content must be at least 100 characters', 400));
  }

  if (summary && (summary.length < 50 || summary.length > 500)) {
    return next(new AppError('Summary must be between 50 and 500 characters', 400));
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

  if (name.length < 2 || name.length > 50) {
    return next(new AppError('Category name must be between 2 and 50 characters', 400));
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

  if (name.length < 2 || name.length > 30) {
    return next(new AppError('Tag name must be between 2 and 30 characters', 400));
  }

  next();
};