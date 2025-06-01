import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { env } from '../config/env';
import { Role } from '@prisma/client';

// Simple token blacklist storage (in production, use Redis)
const blacklistedTokens = new Set<string>();

// Auto cleanup expired tokens every hour
setInterval(() => {
  // In a real application, you'd want to clean up based on token expiry
  // For now, we'll clear the set if it gets too large
  if (blacklistedTokens.size > 10000) {
    blacklistedTokens.clear();
  }
}, 60 * 60 * 1000); // 1 hour

// Definisikan tipe untuk payload JWT Anda
export interface JwtCustomPayload { 
  userId: string;
  role?: Role;
  iat?: number;
  exp?: number;
  [key: string]: any;
}

// Generate JWT
export const generateToken = (userId: string, userRole?: Role): string => {
  const payload: JwtCustomPayload = { 
    userId,
  };
  if (userRole) {
    payload.role = userRole;
  }
  
  const expiresInMilliseconds = env.COOKIE_EXPIRES;
  const expiresInSeconds = Math.floor(expiresInMilliseconds / 1000);
  
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${expiresInSeconds}s`,
  });
};

// Verify JWT
export const verifyToken = (token: string): JwtCustomPayload | null => {
  try {
    // Check if token is blacklisted
    if (blacklistedTokens.has(token)) {
      return null;
    }
    
    return jwt.verify(token, env.JWT_SECRET) as JwtCustomPayload;
  } catch (error) {
    return null;
  }
};

// Blacklist token - EXPORTED
export const blacklistToken = (token: string): void => {
  blacklistedTokens.add(token);
  
  // Optional: Remove token after its natural expiry
  // In production, use Redis with TTL for better performance
  setTimeout(() => {
    blacklistedTokens.delete(token);
  }, env.COOKIE_EXPIRES);
};

// Check if token is blacklisted - EXPORTED
export const isTokenBlacklisted = (token: string): boolean => {
  return blacklistedTokens.has(token);
};

// Get blacklist size (for debugging/monitoring)
export const getBlacklistSize = (): number => {
  return blacklistedTokens.size;
};

// Clear all blacklisted tokens (admin function)
export const clearBlacklist = (): void => {
  blacklistedTokens.clear();
};

// Clear token cookie - EXPORTED
export const clearToken = (res: Response): void => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    expires: new Date(0),
    sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none',
    path: '/',
  });
};