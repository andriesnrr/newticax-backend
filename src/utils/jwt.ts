import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

export const verifyToken = (token: string): { userId: string } | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as { userId: string };
  } catch (error) {
    return null;
  }
};