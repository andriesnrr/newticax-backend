// src/controllers/auth.controller.ts - Update getMeHandler
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/db';
import { generateToken, clearToken, blacklistToken } from '../utils/jwt';
import { env } from '../config/env';
import { AppError } from '../utils/errorHandler';
import { Language, Provider, Role, User as PrismaUser } from '@prisma/client';
import { AuthRequest, RegisterInput, LoginInput, ProfileUpdateInput, PasswordUpdateInput } from '../types';
import { logger } from '../utils/logger';
import { sanitizeInput } from '../utils/sanitize';

// Enhanced salt rounds for better security
const SALT_ROUNDS = 12;

// Rate limiting for sensitive operations
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.',
  },
});

// Enhanced getMeHandler to prevent loops
export const getMeHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      // Clear any invalid cookies to prevent frontend loops
      res.clearCookie('token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      // Add specific headers for frontend to handle
      res.setHeader('X-Auth-Status', 'required');
      res.setHeader('X-Clear-Token', 'true');
      
      logger.warn('getMeHandler: User not authenticated', {
        hasUser: !!req.user,
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
        action: 'redirect_to_login',
      });
      return;
    }

    const userWithDetails = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        preference: true,
        _count: {
          select: {
            articles: true,
            bookmarks: true,
            likes: true,
            comments: true,
          },
        },
      },
    });

    if (!userWithDetails) {
      // User exists in token but not in database - clear token
      res.clearCookie('token', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
        path: '/',
      });
      
      res.setHeader('X-Auth-Status', 'invalid');
      res.setHeader('X-Clear-Token', 'true');
      
      logger.warn('getMeHandler: Authenticated user not found in database', {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      res.status(401).json({
        success: false,
        message: 'User account no longer exists',
        code: 'USER_NOT_FOUND',
        action: 'redirect_to_login',
      });
      return;
    }

    const { password, ...userData } = userWithDetails;
    
    // Add success headers
    res.setHeader('X-Auth-Status', 'authenticated');
    
    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error('getMeHandler error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
      ip: req.ip,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Clear token on error to prevent loops
    res.clearCookie('token', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
      path: '/',
    });
    
    res.setHeader('X-Auth-Status', 'error');
    res.setHeader('X-Clear-Token', 'true');
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      action: 'retry_or_login',
    });
  }
};

// Enhanced registerHandler
export const registerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, username, language = Language.ENGLISH } = req.body as RegisterInput;

    // Enhanced validation
    if (!name || !email || !password || !username) {
      next(new AppError('Name, email, username, and password are required', 400));
      return;
    }

    // Sanitize inputs
    const sanitizedData = sanitizeInput({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      username: username.toLowerCase().trim(),
    });

    // Enhanced password validation
    if (password.length < 8) {
      next(new AppError('Password must be at least 8 characters long', 400));
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      next(new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
      return;
    }

    // Enhanced email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedData.email)) {
      next(new AppError('Please provide a valid email address', 400));
      return;
    }

    // Username validation
    if (sanitizedData.username.length < 3 || sanitizedData.username.length > 30) {
      next(new AppError('Username must be between 3 and 30 characters', 400));
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sanitizedData.username)) {
      next(new AppError('Username can only contain letters, numbers, underscores, and hyphens', 400));
      return;
    }

    // Check for existing user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: sanitizedData.email },
          { username: sanitizedData.username },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === sanitizedData.email) {
        next(new AppError('Email already registered', 400));
        return;
      }
      if (existingUser.username === sanitizedData.username) {
        next(new AppError('Username already taken', 400));
        return;
      }
    }

    // Hash password with higher salt rounds
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user with transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: sanitizedData.name,
          email: sanitizedData.email,
          username: sanitizedData.username,
          password: hashedPassword,
          language,
          provider: Provider.EMAIL,
        },
      });

      // Create default preferences
      await tx.preference.create({
        data: {
          userId: user.id,
          categories: [],
        },
      });

      return user;
    });

    // Generate token
    const token = generateToken(result.id, result.role);

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
      path: '/',
    });

    // Remove password from response
    const { password: _, ...userData } = result;
    
    // Log successful registration
    logger.info('User registered successfully', {
      userId: result.id,
      email: result.email,
      username: result.username,
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: userData,
      token,
    });
  } catch (error) {
    logger.error('Registration error', { error, email: req.body?.email });
    next(error);
  }
};

// Enhanced loginHandler
export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password, rememberMe = false } = req.body as LoginInput & { rememberMe?: boolean };
    
    if (!email || !password) {
      next(new AppError('Email and password are required', 400));
      return;
    }

    // Sanitize email
    const sanitizedEmail = email.toLowerCase().trim();

    // Find user with password field
    const user = await prisma.user.findUnique({
      where: { email: sanitizedEmail },
      include: {
        preference: true,
      },
    });

    if (!user) {
      // Log failed login attempt
      logger.warn('Login attempt with non-existent email', {
        email: sanitizedEmail,
        ip: req.ip,
      });
      next(new AppError('Invalid email or password', 401));
      return;
    }

    if (!user.password) {
      logger.warn('Login attempt for OAuth user without password', {
        userId: user.id,
        provider: user.provider,
        ip: req.ip,
      });
      next(new AppError(`Please login using ${user.provider?.toLowerCase() || 'your social account'}. Password not set.`, 401));
      return;
    }

    // Verify password
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      logger.warn('Failed login attempt - incorrect password', {
        userId: user.id,
        email: sanitizedEmail,
        ip: req.ip,
      });
      next(new AppError('Invalid email or password', 401));
      return;
    }

    // Generate token with extended expiry if remember me is checked
    const tokenExpiry = rememberMe ? 30 * 24 * 60 * 60 * 1000 : env.COOKIE_EXPIRES; // 30 days vs default
    const token = generateToken(user.id, user.role);

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: tokenExpiry,
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
      path: '/',
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() },
    });
    
    // Remove password from response
    const { password: _, ...userData } = user;
    
    // Log successful login
    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      rememberMe,
    });
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: userData,
      token,
    });
  } catch (error) {
    logger.error('Login error', { error, email: req.body?.email });
    next(error);
  }
};

export const logoutHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from cookie or header
    const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Add token to blacklist
      blacklistToken(token);
      
      // Log logout
      logger.info('User logged out', {
        userId: req.user?.id,
        ip: req.ip,
      });
    }

    // Clear token cookie
    clearToken(res);
    
    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout error', { error, userId: req.user?.id });
    next(error);
  }
};

export const socialLoginCallbackHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      logger.warn('Social login callback without user', { ip: req.ip });
      res.redirect(`${env.FRONTEND_URL}/login?error=social_auth_failed`);
      return;
    }

    const user = req.user as PrismaUser;
    const token = generateToken(user.id, user.role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: 'lax',
      path: '/',
    });

    logger.info('Social login successful', {
      userId: user.id,
      provider: user.provider,
      ip: req.ip,
    });

    res.redirect(`${env.FRONTEND_URL}/auth/success`);
  } catch (error) {
    logger.error('Social login callback error', { error });
    res.redirect(`${env.FRONTEND_URL}/login?error=social_processing_error`);
  }
};

export const updateProfileHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }

    const { name, bio, image } = req.body as ProfileUpdateInput;

    // Validate input
    if (!name && !bio && image === undefined) {
      next(new AppError('At least one field (name, bio, or image) is required', 400));
      return;
    }

    // Sanitize inputs
    const updateData: Partial<ProfileUpdateInput> = {};
    
    if (name) {
      if (name.trim().length < 2) {
        next(new AppError('Name must be at least 2 characters long', 400));
        return;
      }
      updateData.name = sanitizeInput({ name: name.trim() }).name;
    }

    if (bio !== undefined) {
      if (bio && bio.length > 500) {
        next(new AppError('Bio must be less than 500 characters', 400));
        return;
      }
      updateData.bio = bio ? sanitizeInput({ bio: bio.trim() }).bio : null;
    }

    if (image !== undefined) {
      updateData.image = image;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: {
        preference: true,
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;

    logger.info('Profile updated', {
      userId: req.user.id,
      updatedFields: Object.keys(updateData),
    });

    res.status(200).json({
      success: true,
      data: userWithoutPassword,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    logger.error('Profile update error', { error, userId: req.user?.id });
    next(error);
  }
};

export const updatePasswordHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }

    const { currentPassword, newPassword, oldPassword } = req.body as PasswordUpdateInput;
    const effectiveOldPassword = currentPassword || oldPassword;

    if (!effectiveOldPassword || !newPassword) {
      next(new AppError('Current password and new password are required', 400));
      return;
    }

    // Enhanced password validation
    if (newPassword.length < 8) {
      next(new AppError('New password must be at least 8 characters long', 400));
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      next(new AppError('New password must contain at least one uppercase letter, one lowercase letter, and one number', 400));
      return;
    }

    if (effectiveOldPassword === newPassword) {
      next(new AppError('New password must be different from current password', 400));
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.password) {
      next(new AppError('User not found or password not set for this account', 400));
      return;
    }

    const isMatch = await bcrypt.compare(effectiveOldPassword, user.password);
    if (!isMatch) {
      logger.warn('Failed password change attempt - incorrect current password', {
        userId: req.user.id,
        ip: req.ip,
      });
      next(new AppError('Incorrect current password', 401));
      return;
    }

    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    logger.info('Password changed successfully', {
      userId: req.user.id,
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    logger.error('Password update error', { error, userId: req.user?.id });
    next(error);
  }
};

export const updateLanguageHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }

    const { language } = req.body as { language: Language };
    
    if (!language || !Object.values(Language).includes(language)) {
      next(new AppError('Invalid language provided', 400));
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { language },
      include: {
        preference: true,
      },
    });

    const { password: _, ...userWithoutPassword } = updatedUser;

    logger.info('Language preference updated', {
      userId: req.user.id,
      newLanguage: language,
    });

    res.status(200).json({
      success: true,
      data: userWithoutPassword,
      message: 'Language preference updated',
    });
  } catch (error) {
    logger.error('Language update error', { error, userId: req.user?.id });
    next(error);
  }
};

export const updatePreferenceHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      next(new AppError('Authentication required', 401));
      return;
    }
    
    const { categories, notifications, darkMode, emailUpdates } = req.body;

    // Validate categories if provided
    if (categories && Array.isArray(categories)) {
      if (categories.length > 10) {
        next(new AppError('Maximum 10 categories allowed', 400));
        return;
      }
      
      // Validate that all categories exist
      const validCategories = await prisma.category.findMany({
        where: { id: { in: categories } },
        select: { id: true },
      });
      
      if (validCategories.length !== categories.length) {
        next(new AppError('One or more invalid categories provided', 400));
        return;
      }
    }

    const preferenceData: any = {};
    if (categories !== undefined) preferenceData.categories = categories;
    if (notifications !== undefined) preferenceData.notifications = notifications;
    if (darkMode !== undefined) preferenceData.darkMode = darkMode;
    if (emailUpdates !== undefined) preferenceData.emailUpdates = emailUpdates;

    const updatedPreference = await prisma.preference.upsert({
      where: { userId: req.user.id },
      update: preferenceData,
      create: {
        userId: req.user.id,
        categories: categories || [],
        notifications: notifications !== undefined ? notifications : true,
        darkMode: darkMode !== undefined ? darkMode : false,
        emailUpdates: emailUpdates !== undefined ? emailUpdates : true,
      },
    });

    logger.info('User preferences updated', {
      userId: req.user.id,
      updatedFields: Object.keys(preferenceData),
    });

    res.status(200).json({
      success: true,
      data: updatedPreference,
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    logger.error('Preferences update error', { error, userId: req.user?.id });
    next(error);
  }
};