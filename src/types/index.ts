import { Request } from 'express';
import { User, Language } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: User;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  language?: Language;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProfileUpdateInput {
  name?: string;
  bio?: string;
  image?: string;
}

export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
}

export interface ArticleCreateInput {
  title: string;
  content: string;
  summary: string;
  image?: string;
  categoryId?: string;
  tagIds?: string[];
  language?: Language;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
}

export interface ArticleUpdateInput {
  title?: string;
  content?: string;
  summary?: string;
  image?: string;
  categoryId?: string;
  tagIds?: string[];
  language?: Language;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
}

export interface CommentInput {
  content: string;
  parentId?: string;
}

export interface CategoryInput {
  name: string;
  description?: string;
  image?: string;
}

export interface TagInput {
  name: string;
}

export interface PreferenceInput {
  categories?: string[];
  notifications?: boolean;
  darkMode?: boolean;
  emailUpdates?: boolean;
}