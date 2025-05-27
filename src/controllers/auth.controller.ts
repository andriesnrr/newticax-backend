import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { generateToken, clearToken } from '../utils/jwt';
import { env } from '../config/env';
import { AppError } from '../utils/errorHandler';
import { Language, Provider, Role, User as PrismaUser } from '@prisma/client';
import { AuthRequest, RegisterInput, LoginInput, ProfileUpdateInput, PasswordUpdateInput } from '../types'; // Pastikan RegisterInput di types/index.ts memiliki username

// Mengimpor service jika logika bisnis dipindahkan ke sana
// import * as authService from '../services/auth.service';

export const registerHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, username, language = Language.ENGLISH } = req.body as RegisterInput;

    if (!name || !email || !password || !username) {
      // Jika username tidak di-generate otomatis dan wajib dari input
      next(new AppError('Name, email, username, and password are required', 400));
      return;
    }
    
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        next(new AppError('Email already registered', 400));
        return;
      }
      if (existingUser.username === username) {
        next(new AppError('Username already taken', 400));
        return;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Membuat user baru dengan username
    const user = await prisma.user.create({
      data: {
        name,
        email,
        username, // USERNAME SEKARANG DISERTAKAN
        password: hashedPassword,
        language,
        provider: Provider.EMAIL, // Default untuk registrasi email
        // role akan menggunakan default dari schema (USER)
      },
    });

    await prisma.preference.create({
      data: {
        userId: user.id,
        categories: [],
      },
    });

    const token = generateToken(user.id, user.role); 

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
    });

    const { password: _, ...userData } = user;
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: userData,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body as LoginInput;
    
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      next(new AppError('Invalid email or password', 401));
      return;
    }

    if (!user.password) {
      next(new AppError(`Please login using ${user.provider?.toLowerCase() || 'your social account'}. Password not set.`, 401));
      return;
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      next(new AppError('Invalid email or password', 401));
      return;
    }

    const token = generateToken(user.id, user.role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
    });
    
    const { password: _, ...userData } = user;
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: userData,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const getMeHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      next(new AppError('User not authenticated or user ID missing', 401));
      return;
    }

    const userWithDetails = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        preference: true,
      },
    });

    if (!userWithDetails) {
      next(new AppError('Authenticated user not found in database', 404));
      return;
    }

    const { password, ...userData } = userWithDetails;
    
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
): void => {
  try {
    clearToken(res);
    
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
  res: Response,
  next: NextFunction 
): void => {
  try {
    if (!req.user) {
      // Redirect ke halaman login frontend dengan pesan error
      // Pastikan env.FRONTEND_URL sudah didefinisikan di config/env.ts
      res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/login?error=social_auth_failed`);
      return;
    }

    const user = req.user as PrismaUser; 
    const token = generateToken(user.id, user.role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: env.COOKIE_EXPIRES,
      sameSite: 'lax', 
    });

    res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/auth/success`);
  } catch (error) {
    console.error("Error in socialLoginCallbackHandler:", error);
    // next(error); // Teruskan ke error handler global jika ingin log atau ada penanganan khusus
    // Atau redirect ke halaman error di frontend
     res.redirect(`${env.FRONTEND_URL || 'http://localhost:3000'}/login?error=social_processing_error`);
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
    // Panggil service jika ada, atau lakukan update langsung
    const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: req.body as ProfileUpdateInput, // Pastikan ProfileUpdateInput sesuai
    });
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.status(200).json({ success: true, data: userWithoutPassword, message: 'Profile updated successfully' });
  } catch (error) {
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
        next(new AppError('Current/Old password and new password are required', 400));
        return;
    }
    
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.password) {
        next(new AppError('User not found or password not set for this account', 400));
        return;
    }

    const isMatch = await bcrypt.compare(effectiveOldPassword, user.password);
    if (!isMatch) {
        next(new AppError('Incorrect current password', 401));
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
        where: { id: req.user.id },
        data: { password: hashedPassword },
    });

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
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
        where: {id: req.user.id},
        data: { language }
    });
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.status(200).json({ success: true, data: userWithoutPassword, message: 'Language preference updated' });
  } catch (error) {
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
    
    const preferenceData = req.body; // Asumsi req.body adalah PreferenceInput
    const updatedPreference = await prisma.preference.upsert({
        where: { userId: req.user.id },
        update: preferenceData,
        create: {
            userId: req.user.id,
            ...preferenceData,
        },
    });
    res.status(200).json({ success: true, data: updatedPreference, message: 'Preferences updated' });
  } catch (error) {
    next(error);
  }
};
