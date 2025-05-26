import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { generateToken } from '../utils/jwt';
import { env } from '../config/env';
import { AppError } from '../utils/errorHandler';
import { Language, Provider, Role } from '@prisma/client';
import { AuthRequest } from '../types';

export const registerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, password, language = Language.ENGLISH } = req.body;
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('Email already registered', 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        language,
        provider: Provider.EMAIL,
      },
    });

    // Create default preferences
    await prisma.preference.create({
      data: {
        userId: user.id,
        categories: [],
      },
    });

    // Generate token
    const token = generateToken(user.id);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: 'strict',
    });

    // Return user data (without password)
    const { password: _, ...userData } = user;
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Check if user is using social login and doesn't have a password
    if (!user.password) {
      throw new AppError(`Please login using ${user.provider?.toLowerCase() || 'social'} authentication`, 401);
    }

    // Verify password
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    // Generate token
    const token = generateToken(user.id);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: 'strict',
    });

    // Return user data (without password)
    const { password: _, ...userData } = user;
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const getMeHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    // Get user with preferences
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        preference: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Return user without password
    const { password, ...userData } = user;
    
    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const logoutHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Clear cookie
    res.clearCookie('token');
    
    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};

export const socialLoginCallbackHandler = (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.redirect(`${env.CORS_ORIGIN}/login?error=auth_failed`);
    }

    // Generate token
    const token = generateToken(req.user.id);

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: 'lax', // 'lax' for cross-site redirects
    });

    // Redirect to frontend with success
    res.redirect(`${env.CORS_ORIGIN}/auth/success`);
  } catch (error) {
    // Redirect to frontend with error
    res.redirect(`${env.CORS_ORIGIN}/login?error=auth_failed`);
  }
};

export const updateProfileHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { name, bio, image } = req.body;

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        bio,
        image,
      },
    });

    // Return updated user (without password)
    const { password, ...userData } = updatedUser;
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePasswordHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Check if user has a password (for social login users)
    if (!user.password) {
      throw new AppError('Cannot update password for social login account', 400);
    }

    // Verify current password
    const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordMatch) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashedPassword,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateLanguageHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { language } = req.body;

    // Validate language
    if (!Object.values(Language).includes(language)) {
      throw new AppError('Invalid language selection', 400);
    }

    // Update language preference
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        language,
      },
    });

    // Return updated user (without password)
    const { password, ...userData } = updatedUser;
    
    res.status(200).json({
      success: true,
      message: 'Language preference updated successfully',
      data: userData,
    });
  } catch (error) {
    next(error);
  }
};

export const updatePreferenceHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError('User not found', 404);
    }

    const { categories, notifications, darkMode, emailUpdates } = req.body;

    // Update or create preference
    const preference = await prisma.preference.upsert({
      where: {
        userId: req.user.id,
      },
      update: {
        categories: categories || [],
        notifications: notifications !== undefined ? notifications : undefined,
        darkMode: darkMode !== undefined ? darkMode : undefined,
        emailUpdates: emailUpdates !== undefined ? emailUpdates : undefined,
      },
      create: {
        userId: req.user.id,
        categories: categories || [],
        notifications: notifications !== undefined ? notifications : true,
        darkMode: darkMode !== undefined ? darkMode : false,
        emailUpdates: emailUpdates !== undefined ? emailUpdates : true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: preference,
    });
  } catch (error) {
    next(error);
  }
};
