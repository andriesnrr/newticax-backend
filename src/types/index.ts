import { Request } from 'express';
// Import User and enum directly from @prisma/client to ensure consistency
import { 
    User as PrismaClientUser, 
    Language as PrismaLanguageEnum,
    Role as PrismaRoleEnum,
    Provider as PrismaProviderEnum,
    Preference
} from '@prisma/client';

// Define the complete User type that includes all fields from Prisma
export type User = PrismaClientUser & {
  preference?: Preference | null;
  _count?: {
    articles: number;
    bookmarks: number;
    likes: number;
    comments: number;
  };
};

// AuthRequest extends Express Request with optional user
export interface AuthRequest extends Request {
  user?: User;
}

// Re-export enums for convenience
export { PrismaLanguageEnum as Language };
export { PrismaRoleEnum as Role };
export { PrismaProviderEnum as Provider };

// Input DTOs
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  username: string;
  language?: PrismaLanguageEnum; 
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProfileUpdateInput {
  name?: string;
  bio?: string;
  image?: string | null;
}

export interface PasswordUpdateInput {
  currentPassword?: string; 
  newPassword: string;    
  oldPassword?: string; 
}

export interface ArticleCreateInputDto { 
  title: string;
  content: string;
  summary: string;
  image?: string | null; 
  categoryId?: string | null;
  tagIds?: string[]; 
  language?: PrismaLanguageEnum;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface ArticleUpdateInputDto {
  title?: string;
  content?: string;
  summary?: string;
  image?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  language?: PrismaLanguageEnum;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface CommentInput {
  content: string;
  parentId?: string | null; 
}

export interface CategoryInput {
  name: string;
  slug?: string; 
  description?: string | null;
  image?: string | null;
}

export interface TagInput {
  name: string;
  slug?: string; 
}

export interface PreferenceInput {
  categories?: string[]; 
  notifications?: boolean;
  darkMode?: boolean;
  emailUpdates?: boolean;
}

// Import JwtCustomPayload from utils/jwt.ts
import { JwtCustomPayload } from '../utils/jwt';
export type MyCustomJwtPayload = JwtCustomPayload;