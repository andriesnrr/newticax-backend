import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { LoginInput, RegisterInput } from '../types';
import { User } from '@prisma/client';

export const register = async ({
  name,
  email,
  password,
}: RegisterInput): Promise<User> => {
  // Check if user with email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError('Email sudah terdaftar', 400);
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create new user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
    },
  });

  return user;
};

export const login = async ({
  email,
  password,
}: LoginInput): Promise<User> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError('Email atau password salah', 401);
  }

  // Compare passwords
  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new AppError('Email atau password salah', 401);
  }

  return user;
};

export const getUserById = async (userId: string): Promise<User> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('User tidak ditemukan', 404);
  }

  return user;
};
