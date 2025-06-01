import { z } from 'zod';
import { Language, Role, Provider } from '@prisma/client';
import { logger } from './logger'; // Import logger yang hilang

// Base validation schemas
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(254, 'Email too long')
  .transform(email => email.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number'
  );

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username too long')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .transform(username => username.toLowerCase());

export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name too long')
  .regex(
    /^[a-zA-Z\s'-]+$/,
    'Name can only contain letters, spaces, hyphens, and apostrophes'
  )
  .transform(name => name.trim());

// MongoDB ObjectId validation
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

// Pagination schemas
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 1)
    .refine(val => val > 0 && val <= 10000, 'Invalid page number'),
  limit: z
    .string()
    .optional()
    .transform(val => val ? parseInt(val, 10) : 10)
    .refine(val => val > 0 && val <= 100, 'Invalid limit'),
});

// User validation schemas
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  language: z.nativeEnum(Language).optional().default(Language.ENGLISH),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const profileUpdateSchema = z.object({
  name: nameSchema.optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  image: z.string().url('Invalid image URL').optional().nullable(),
});

export const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// Article validation schemas
export const articleCreateSchema = z.object({
  title: z
    .string()
    .min(10, 'Title must be at least 10 characters')
    .max(200, 'Title too long'),
  content: z
    .string()
    .min(100, 'Content must be at least 100 characters')
    .max(50000, 'Content too long'),
  summary: z
    .string()
    .min(50, 'Summary must be at least 50 characters')
    .max(500, 'Summary too long'),
  image: z.string().url('Invalid image URL').optional().nullable(),
  categoryId: objectIdSchema.optional().nullable(),
  tagIds: z.array(objectIdSchema).max(10, 'Maximum 10 tags allowed').optional(),
  language: z.nativeEnum(Language).optional().default(Language.ENGLISH),
  published: z.boolean().optional().default(true),
});

export const articleUpdateSchema = articleCreateSchema.partial();

// Comment validation schema
export const commentSchema = z.object({
  content: z
    .string()
    .min(2, 'Comment must be at least 2 characters')
    .max(1000, 'Comment too long'),
  parentId: objectIdSchema.optional().nullable(),
});

// Category validation schema
export const categorySchema = z.object({
  name: z
    .string()
    .min(2, 'Category name must be at least 2 characters')
    .max(50, 'Category name too long')
    .regex(
      /^[a-zA-Z0-9\s&-]+$/,
      'Category name can only contain letters, numbers, spaces, ampersands, and hyphens'
    ),
  description: z.string().max(200, 'Description too long').optional().nullable(),
  image: z.string().url('Invalid image URL').optional().nullable(),
});

// Tag validation schema
export const tagSchema = z.object({
  name: z
    .string()
    .min(2, 'Tag name must be at least 2 characters')
    .max(30, 'Tag name too long')
    .regex(
      /^[a-zA-Z0-9\s-]+$/,
      'Tag name can only contain letters, numbers, spaces, and hyphens'
    ),
});

// Preference validation schema
export const preferenceSchema = z.object({
  categories: z.array(objectIdSchema).max(10, 'Maximum 10 categories allowed').optional(),
  notifications: z.boolean().optional(),
  darkMode: z.boolean().optional(),
  emailUpdates: z.boolean().optional(),
});

// Admin validation schemas
export const userRoleUpdateSchema = z.object({
  role: z.nativeEnum(Role),
});

export const articleStatusUpdateSchema = z.object({
  isTrending: z.boolean().optional(),
  isBreaking: z.boolean().optional(),
  published: z.boolean().optional(),
});

// Search validation schema
export const searchSchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  author: z.string().optional(),
  language: z.nativeEnum(Language).optional(),
  sortBy: z.enum(['relevance', 'date', 'popularity']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Validation helper function
export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      
      logger.warn('Validation failed', { errors: formattedErrors, data });
      
      throw new Error(`Validation failed: ${formattedErrors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
};