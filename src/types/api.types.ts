import { User, Article, Category, Tag, Comment, Like, Bookmark, ReadHistory, Notification, Language, Role, Provider } from '@prisma/client';

// Base API Response types
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

// Extended entity types (with relations)
export interface UserWithRelations extends User {
  _count?: {
    articles: number;
    bookmarks: number;
    likes: number;
    comments: number;
  };
  preference?: {
    categories: string[];
    notifications: boolean;
    darkMode: boolean;
    emailUpdates: boolean;
  };
}

export interface ArticleWithRelations extends Article {
  author?: {
    id: string;
    name: string;
    username: string;
    image?: string;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  tags?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  _count?: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
  isBookmarked?: boolean;
  isLiked?: boolean;
  relatedArticles?: ArticleWithRelations[];
}

export interface CommentWithRelations extends Comment {
  user: {
    id: string;
    name: string;
    image?: string;
  };
  replies?: CommentWithRelations[];
  _count?: {
    replies: number;
  };
  hasMoreReplies?: boolean;
}

export interface CategoryWithRelations extends Category {
  _count?: {
    articles: number;
  };
  latestArticle?: {
    id: string;
    title: string;
    publishedAt: Date;
  };
}

export interface TagWithRelations extends Tag {
  _count?: {
    articles: number;
  };
}

// Request body types
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  name: string;
  email: string;
  username: string;
  password: string;
  language?: Language;
}

export interface ArticleCreateRequest {
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

export interface ArticleUpdateRequest extends Partial<ArticleCreateRequest> {}

export interface CommentCreateRequest {
  content: string;
  parentId?: string;
}

export interface ProfileUpdateRequest {
  name?: string;
  bio?: string;
  image?: string;
}

export interface PasswordUpdateRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PreferenceUpdateRequest {
  categories?: string[];
  notifications?: boolean;
  darkMode?: boolean;
  emailUpdates?: boolean;
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
  role?: Role;
  provider?: Provider;
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
    role: Role;
    createdAt: Date;
    provider?: Provider;
  }>;
  lastUpdated: string;
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
  publishedAt: Date;
  createdAt: Date;
  author?: {
    name: string;
  };
  viewCount: number;
  shareCount: number;
  language: Language;
}

// News sync types
export interface NewsSyncRequest {
  categories?: string[];
  language?: Language;
}

export interface NewsSyncResult {
  totalSynced: number;
  totalProcessed: number;
  errors: string[];
  categories: string[];
  language: Language;
  duration: number;
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
  keyCount?: number;
  memoryInfo?: string;
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
  status: 'ok' | 'error';
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
    percentage: number;
  };
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
  usersByRole: Record<Role, number>;
  usersByProvider: Record<Provider, number>;
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
  articles: ArticleWithRelations[];
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
  language?: Language;
  limit?: number;
  excludeRead?: boolean;
  categories?: string[];
}

export interface RecommendationResult {
  articles: ArticleWithRelations[];
  reasons: Array<{
    articleId: string;
    reason: 'category_preference' | 'reading_history' | 'popular' | 'trending';
    score: number;
  }>;
  refreshedAt: Date;
}

// Export utility type for API handlers
export type ApiHandler<T = any> = (
  req: any,
  res: any,
  next: any
) => Promise<ApiResponse<T>> | ApiResponse<T>;