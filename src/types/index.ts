import { Request } from 'express';
// Import User and enum directly from @prisma/client to ensure consistency
import { 
    User as PrismaClientUser, 
    Language as PrismaLanguageEnum,
    Role as PrismaRoleEnum,
    Provider as PrismaProviderEnum,
    Preference,
    Article as PrismaArticle,
    Category as PrismaCategory,
    Tag as PrismaTag,
    Comment as PrismaComment,
    Like as PrismaLike,
    Bookmark as PrismaBookmark,
    ReadHistory as PrismaReadHistory,
    Notification as PrismaNotification
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

// Enhanced Article type with external content handling
export interface Article extends Omit<PrismaArticle, 'tagIds'> {
  // Enhanced fields for external content handling
  isContentTruncated?: boolean;
  hasFullContentAtSource?: boolean;
  contentNote?: string;
  
  // Relations
  author?: {
    id: string;
    name: string;
    username?: string;
    image?: string;
    bio?: string;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string;
  };
  tags?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  tagIds?: string[];
  _count?: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
  
  // User interaction status (for authenticated users)
  isBookmarked?: boolean;
  isLiked?: boolean;
  
  // Additional metadata
  relatedArticles?: Article[];
}

// Enhanced Comment type with nested replies
export interface Comment extends PrismaComment {
  user: {
    id: string;
    name: string;
    username?: string;
    image?: string;
  };
  replies?: Comment[];
  _count?: {
    replies: number;
  };
  hasMoreReplies?: boolean;
}

// Enhanced Category type with stats
export interface Category extends PrismaCategory {
  _count?: {
    articles: number;
  };
  latestArticle?: {
    id: string;
    title: string;
    publishedAt: Date;
  };
}

// Enhanced Tag type with usage stats
export interface Tag extends PrismaTag {
  _count?: {
    articles: number;
  };
}

// Input DTOs with enhanced validation
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
  rememberMe?: boolean;
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

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: PaginationMeta;
  meta?: Record<string, any>;
  errors?: ValidationError[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

// Query parameter types
export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface SearchQuery extends PaginationQuery {
  q?: string;
  category?: string;
  tag?: string;
  author?: string;
  language?: string;
  sortBy?: 'relevance' | 'date' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

export interface ArticlesQuery extends PaginationQuery {
  language?: string;
  categoryId?: string;
  featured?: string;
  authorId?: string;
  published?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UsersQuery extends PaginationQuery {
  search?: string;
  role?: PrismaRoleEnum;
  provider?: PrismaProviderEnum;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CategoriesQuery extends PaginationQuery {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TagsQuery extends PaginationQuery {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CommentsQuery extends PaginationQuery {
  sortOrder?: 'asc' | 'desc';
}

// External API types (NewsAPI)
export interface ExternalArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  summary: string;
  image?: string;
  source: string;
  sourceUrl: string;
  externalId: string;
  isExternal: boolean;
  isContentTruncated?: boolean;
  hasFullContentAtSource?: boolean;
  publishedAt: Date;
  createdAt: Date;
  author?: {
    name: string;
  };
  viewCount: number;
  shareCount: number;
  language: PrismaLanguageEnum;
}

// News sync types
export interface NewsSyncRequest {
  categories?: string[];
  language?: PrismaLanguageEnum;
}

export interface NewsSyncResult {
  totalSynced: number;
  totalProcessed?: number;
  errors: string[] | null;
  categories?: string[];
  language?: PrismaLanguageEnum;
  duration?: number;
}

// Dashboard response types
export interface DashboardStats {
  counts: {
    users: number;
    articles: number;
    comments: number;
    categories: number;
  };
  stats: {
    totalViews: number;
    totalLikes: number;
    totalBookmarks: number;
    totalShares: number;
  };
  growth: {
    userGrowthRate: number;
    newUsersThisMonth: number;
  };
  topArticles: Array<{
    id: string;
    title: string;
    slug: string;
    viewCount: number;
    publishedAt: Date;
    category?: {
      name: string;
      slug: string;
    };
    author?: {
      name: string;
      username: string;
    };
    _count: {
      likes: number;
      comments: number;
    };
  }>;
  recentArticles: Array<{
    id: string;
    title: string;
    slug: string;
    published: boolean;
    createdAt: Date;
    author?: {
      id: string;
      name: string;
      username: string;
    };
    category?: {
      name: string;
      slug: string;
    };
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    username: string;
    email: string;
    role: PrismaRoleEnum;
    createdAt: Date;
    provider?: PrismaProviderEnum;
  }>;
  lastUpdated: string;
}

// Content handling types
export interface ContentCleaningOptions {
  removeHtml?: boolean;
  removeTruncationPatterns?: boolean;
  maxLength?: number;
  preserveLineBreaks?: boolean;
}

export interface ContentProcessingResult {
  cleaned: string;
  original: string;
  wasTruncated: boolean;
  hasHtml: boolean;
  length: number;
}

// File upload types
export interface FileUploadResponse {
  success: boolean;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
  url: string;
  path: string;
}

export interface FileUploadError {
  success: false;
  message: string;
  code: string;
}

// Cache types
export interface CacheStats {
  available: boolean;
  type: 'redis' | 'memory' | 'none';
  keyCount?: number;
  memoryInfo?: string;
  connected: boolean;
  error?: string;
}

// Email types
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendRequest {
  to: string | string[];
  subject: string;
  template?: string;
  data?: Record<string, any>;
  text?: string;
  html?: string;
}

// Audit types
export interface AuditLogEntry {
  action: string;
  userId?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  timestamp: Date;
}

// Security types
export interface SecurityEvent {
  type: 'LOGIN_ATTEMPT' | 'RATE_LIMIT' | 'SUSPICIOUS_ACTIVITY' | 'XSS_ATTEMPT' | 'SQL_INJECTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ip: string;
  userAgent?: string;
  userId?: string;
  details: Record<string, any>;
  timestamp: Date;
}

// Health check types
export interface HealthCheckResponse {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  services: {
    database: boolean;
    redis: boolean;
    email: boolean;
  };
  memory: {
    used: number;
    total: number;
    external: number;
    rss: number;
  };
  loopPrevention?: {
    active: boolean;
    trackedClients: number;
  };
  config?: {
    port: number;
    corsOrigin: string;
    hasJwtSecret: boolean;
    hasCookieSecret: boolean;
    hasDatabaseUrl: boolean;
    hasNewsApiKey: boolean;
    authMode: string;
  };
  duration?: number;
}

// API Error types
export interface ApiError {
  success: false;
  message: string;
  code: string;
  details?: Record<string, any>;
  stack?: string; // Only in development
}

// Statistics types
export interface ArticleStats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  externalArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  averageViews: number;
  topCategories: Array<{
    name: string;
    count: number;
  }>;
  topAuthors: Array<{
    name: string;
    count: number;
  }>;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  usersByRole: Record<PrismaRoleEnum, number>;
  usersByProvider: Record<PrismaProviderEnum, number>;
}

// Reading analytics types
export interface ReadingAnalytics {
  totalArticlesRead: number;
  readingTimeToday: number;
  readingTimeWeek: number;
  readingTimeMonth: number;
  favoriteCategories: Array<{
    category: string;
    count: number;
  }>;
  readingStreak: number;
  averageReadingTime: number;
}

// Notification types
export interface NotificationData {
  type: 'like' | 'comment' | 'reply' | 'follow' | 'article' | 'system';
  title: string;
  message: string;
  data?: Record<string, any>;
  userId: string;
  read?: boolean;
}

// Rate limiting types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

// Trending types
export interface TrendingData {
  articles: Article[];
  categories: Array<{
    name: string;
    slug: string;
    articleCount: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  tags: Array<{
    name: string;
    slug: string;
    usage: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  authors: Array<{
    name: string;
    username: string;
    articleCount: number;
    totalViews: number;
  }>;
}

// Content recommendation types
export interface RecommendationParams {
  userId: string;
  language?: PrismaLanguageEnum;
  limit?: number;
  excludeRead?: boolean;
  categories?: string[];
}

export interface RecommendationResult {
  articles: Article[];
  reasons: Array<{
    articleId: string;
    reason: 'category_preference' | 'reading_history' | 'popular' | 'trending';
    score: number;
  }>;
  refreshedAt: Date;
}

// Import JwtCustomPayload from utils/jwt.ts
import { JwtCustomPayload } from '../utils/jwt';
export type MyCustomJwtPayload = JwtCustomPayload;

// Export utility type for API handlers
export type ApiHandler<T = any> = (
  req: any,
  res: any,
  next: any
) => Promise<ApiResponse<T>> | ApiResponse<T>;

// NewsAPI specific types
export interface NewsAPIParams {
  q?: string;
  category?: string;
  country?: string;
  language?: string;
  sources?: string;
  domains?: string;
  from?: string;
  to?: string;
  pageSize?: number;
  page?: number;
}

export interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

export interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

// Enhanced article processing types
export interface ProcessedArticle extends Article {
  originalContent?: string;
  originalSummary?: string;
  processingNote?: string;
  qualityScore?: number;
}