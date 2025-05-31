import { getCachedData, setCachedData, deleteCachedData, deleteCachedPattern } from '../utils/cache';
import { logger } from '../utils/logger';

export class CacheService {
  // Cache keys patterns
  private static readonly KEYS = {
    USER: (id: string) => `user:${id}`,
    ARTICLE: (slug: string) => `article:${slug}`,
    ARTICLES: (params: string) => `articles:${params}`,
    CATEGORY: (slug: string) => `category:${slug}`,
    TRENDING: (lang: string) => `trending:${lang}`,
    BREAKING: (lang: string) => `breaking:${lang}`,
    COMMENTS: (articleId: string, page: number) => `comments:${articleId}:${page}`,
    SEARCH: (query: string) => `search:${Buffer.from(query).toString('base64')}`,
    DASHBOARD: () => 'dashboard:stats',
    NEWS_API: (params: string) => `newsapi:${params}`,
  };

  // Get user data from cache
  static async getUser(userId: string) {
    const key = this.KEYS.USER(userId);
    return await getCachedData(key);
  }

  // Cache user data
  static async setUser(userId: string, userData: any, ttl: number = 3600) {
    const key = this.KEYS.USER(userId);
    await setCachedData(key, userData, ttl);
  }

  // Invalidate user cache
  static async invalidateUser(userId: string) {
    const key = this.KEYS.USER(userId);
    await deleteCachedData(key);
    
    // Also invalidate user-specific patterns
    await deleteCachedPattern(`*${userId}*`);
  }

  // Get article from cache
  static async getArticle(slug: string) {
    const key = this.KEYS.ARTICLE(slug);
    return await getCachedData(key);
  }

  // Cache article data
  static async setArticle(slug: string, articleData: any, ttl: number = 1800) {
    const key = this.KEYS.ARTICLE(slug);
    await setCachedData(key, articleData, ttl);
  }

  // Invalidate article cache
  static async invalidateArticle(slug: string) {
    const key = this.KEYS.ARTICLE(slug);
    await deleteCachedData(key);
    
    // Invalidate related caches
    await deleteCachedPattern('articles:*');
    await deleteCachedPattern('trending:*');
    await deleteCachedPattern('search:*');
  }

  // Get articles list from cache
  static async getArticles(params: any) {
    const paramString = JSON.stringify(params);
    const key = this.KEYS.ARTICLES(paramString);
    return await getCachedData(key);
  }

  // Cache articles list
  static async setArticles(params: any, articles: any, ttl: number = 300) {
    const paramString = JSON.stringify(params);
    const key = this.KEYS.ARTICLES(paramString);
    await setCachedData(key, articles, ttl);
  }

  // Get trending articles
  static async getTrending(language: string) {
    const key = this.KEYS.TRENDING(language);
    return await getCachedData(key);
  }

  // Cache trending articles
  static async setTrending(language: string, articles: any, ttl: number = 600) {
    const key = this.KEYS.TRENDING(language);
    await setCachedData(key, articles, ttl);
  }

  // Get breaking news
  static async getBreaking(language: string) {
    const key = this.KEYS.BREAKING(language);
    return await getCachedData(key);
  }

  // Cache breaking news
  static async setBreaking(language: string, articles: any, ttl: number = 300) {
    const key = this.KEYS.BREAKING(language);
    await setCachedData(key, articles, ttl);
  }

  // Get dashboard stats
  static async getDashboard() {
    const key = this.KEYS.DASHBOARD();
    return await getCachedData(key);
  }

  // Cache dashboard stats
  static async setDashboard(stats: any, ttl: number = 300) {
    const key = this.KEYS.DASHBOARD();
    await setCachedData(key, stats, ttl);
  }

  // Invalidate all dashboard cache
  static async invalidateDashboard() {
    const key = this.KEYS.DASHBOARD();
    await deleteCachedData(key);
  }

  // Get search results
  static async getSearch(query: string) {
    const key = this.KEYS.SEARCH(query);
    return await getCachedData(key);
  }

  // Cache search results
  static async setSearch(query: string, results: any, ttl: number = 900) {
    const key = this.KEYS.SEARCH(query);
    await setCachedData(key, results, ttl);
  }

  // Get comments
  static async getComments(articleId: string, page: number) {
    const key = this.KEYS.COMMENTS(articleId, page);
    return await getCachedData(key);
  }

  // Cache comments
  static async setComments(articleId: string, page: number, comments: any, ttl: number = 300) {
    const key = this.KEYS.COMMENTS(articleId, page);
    await setCachedData(key, comments, ttl);
  }

  // Invalidate comments cache
  static async invalidateComments(articleId: string) {
    await deleteCachedPattern(`comments:${articleId}:*`);
  }

  // Bulk invalidation for content updates
  static async invalidateContent() {
    await Promise.all([
      deleteCachedPattern('articles:*'),
      deleteCachedPattern('trending:*'),
      deleteCachedPattern('breaking:*'),
      deleteCachedPattern('search:*'),
      this.invalidateDashboard(),
    ]);
    
    logger.info('Content cache invalidated');
  }

  // Clear all cache (use with caution)
  static async clearAll() {
    await deleteCachedPattern('*');
    logger.warn('All cache cleared');
  }
}