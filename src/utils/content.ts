/**
 * Content processing utilities for handling external article content
 * Location: Backend (src/utils/content.ts)
 */

import { logger } from './logger';

// Configuration for content processing
export const CONTENT_CONFIG = {
  MAX_SUMMARY_LENGTH: 500,
  MAX_PREVIEW_LENGTH: 200,
  MIN_CONTENT_LENGTH: 50,
  TRUNCATION_PATTERNS: [
    /\[\+\d+\s*chars?\]$/i,
    /\[\.\.\.\]$/i,
    /\s*\.\.\.\s*$/i,
    /\[Read more\]$/i,
    /\[Continue reading\]$/i,
  ],
  HTML_TAGS_PATTERN: /<[^>]*>/g,
  MULTIPLE_SPACES_PATTERN: /\s+/g,
  MULTIPLE_NEWLINES_PATTERN: /\n{3,}/g,
};

/**
 * Clean content from NewsAPI truncation patterns and other artifacts
 */
export const cleanContentFromTruncation = (content: string | null): string => {
  if (!content) return '';
  
  let cleaned = content.trim();
  
  // Remove various truncation patterns
  CONTENT_CONFIG.TRUNCATION_PATTERNS.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Clean up extra whitespace
  cleaned = cleaned
    .replace(CONTENT_CONFIG.MULTIPLE_SPACES_PATTERN, ' ')
    .replace(CONTENT_CONFIG.MULTIPLE_NEWLINES_PATTERN, '\n\n')
    .trim();
  
  return cleaned;
};

/**
 * Check if content appears to be truncated
 */
export const isContentTruncated = (content: string | null): boolean => {
  if (!content) return false;
  
  // Check for explicit truncation indicators
  const hasTruncationPattern = CONTENT_CONFIG.TRUNCATION_PATTERNS.some(pattern => 
    pattern.test(content)
  );
  
  // Check for suspiciously short content
  const isSuspiciouslyShort = content.length < CONTENT_CONFIG.MIN_CONTENT_LENGTH;
  
  // Check for abrupt endings (no proper sentence ending)
  const hasAbruptEnding = content.length > 20 && 
    !content.match(/[.!?]\s*$/) && 
    !content.endsWith('...');
  
  return hasTruncationPattern || isSuspiciouslyShort || hasAbruptEnding;
};

/**
 * Remove HTML tags from content
 */
export const stripHtml = (html: string): string => {
  if (!html) return '';
  
  return html
    .replace(CONTENT_CONFIG.HTML_TAGS_PATTERN, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

/**
 * Create better summary from available data with priority system
 */
export const createBetterSummary = (
  title: string,
  description: string | null,
  content: string | null,
  maxLength: number = CONTENT_CONFIG.MAX_SUMMARY_LENGTH
): string => {
  let source = '';
  let sourceType = 'title';
  
  // Priority: description > content > title
  if (description && description.length > CONTENT_CONFIG.MIN_CONTENT_LENGTH) {
    source = cleanContentFromTruncation(description);
    sourceType = 'description';
  } else if (content && content.length > CONTENT_CONFIG.MIN_CONTENT_LENGTH) {
    source = cleanContentFromTruncation(content);
    sourceType = 'content';
  } else {
    source = title;
    sourceType = 'title';
  }
  
  // Strip HTML if present
  source = stripHtml(source);
  
  // Truncate to maxLength at word boundary
  if (source.length > maxLength) {
    const truncated = source.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    const lastPeriodIndex = truncated.lastIndexOf('.');
    
    // Prefer to cut at sentence end if close enough
    if (lastPeriodIndex > maxLength * 0.8) {
      source = truncated.substring(0, lastPeriodIndex + 1);
    } else if (lastSpaceIndex > maxLength * 0.8) {
      source = truncated.substring(0, lastSpaceIndex) + '...';
    } else {
      source = truncated + '...';
    }
  }
  
  logger.debug('Summary created', {
    sourceType,
    originalLength: source.length,
    finalLength: source.length,
    wasTruncated: source.endsWith('...'),
  });
  
  return source;
};

/**
 * Create a short preview for cards/lists
 */
export const createPreview = (
  text: string,
  maxLength: number = CONTENT_CONFIG.MAX_PREVIEW_LENGTH
): string => {
  if (!text) return '';
  
  const cleaned = stripHtml(cleanContentFromTruncation(text));
  
  if (cleaned.length <= maxLength) return cleaned;
  
  const truncated = cleaned.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  if (lastSpaceIndex > maxLength * 0.7) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }
  
  return truncated + '...';
};

/**
 * Analyze content quality and provide scoring
 */
export const analyzeContentQuality = (content: string): {
  score: number;
  issues: string[];
  suggestions: string[];
} => {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  // Check content length
  if (content.length < 100) {
    score -= 30;
    issues.push('Content is very short');
    suggestions.push('This appears to be a preview. Full content available at source.');
  } else if (content.length < 300) {
    score -= 15;
    issues.push('Content is relatively short');
  }
  
  // Check for truncation indicators
  if (isContentTruncated(content)) {
    score -= 25;
    issues.push('Content appears to be truncated');
    suggestions.push('Complete article available at original source.');
  }
  
  // Check for HTML remnants
  if (CONTENT_CONFIG.HTML_TAGS_PATTERN.test(content)) {
    score -= 10;
    issues.push('Contains HTML formatting');
  }
  
  // Check sentence structure
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length < 3) {
    score -= 20;
    issues.push('Limited sentence structure');
  }
  
  // Check for proper ending
  if (!content.match(/[.!?]\s*$/) && !content.endsWith('...')) {
    score -= 15;
    issues.push('Abrupt or improper ending');
  }
  
  return {
    score: Math.max(0, score),
    issues,
    suggestions,
  };
};

/**
 * Format external article data with enhanced processing
 */
export const formatExternalArticle = (apiArticle: any): any => {
  const cleanedContent = cleanContentFromTruncation(apiArticle.content);
  const cleanedDescription = cleanContentFromTruncation(apiArticle.description);
  const betterSummary = createBetterSummary(
    apiArticle.title,
    cleanedDescription,
    cleanedContent
  );
  
  // Analyze content quality
  const contentQuality = analyzeContentQuality(cleanedContent || cleanedDescription || '');
  
  // Determine if we should flag this as needing source link
  const needsSourceLink = contentQuality.score < 70 || 
    isContentTruncated(apiArticle.content) || 
    isContentTruncated(apiArticle.description);
  
  return {
    id: `ext-${Buffer.from(apiArticle.url).toString('base64').substring(0, 20)}`,
    title: apiArticle.title,
    slug: createSlugFromTitle(apiArticle.title),
    content: cleanedContent || cleanedDescription || betterSummary,
    summary: betterSummary,
    image: apiArticle.urlToImage,
    source: apiArticle.source?.name || 'External Source',
    sourceUrl: apiArticle.url,
    externalId: apiArticle.url,
    isExternal: true,
    publishedAt: new Date(apiArticle.publishedAt),
    createdAt: new Date(),
    author: apiArticle.author ? { name: apiArticle.author } : null,
    viewCount: 0,
    shareCount: 0,
    
    // Enhanced fields for content handling
    isContentTruncated: isContentTruncated(apiArticle.content) || isContentTruncated(apiArticle.description),
    hasFullContentAtSource: needsSourceLink,
    contentNote: needsSourceLink ? 
      'This is a preview. Click "Read Full Article" for complete content.' : 
      null,
    qualityScore: contentQuality.score,
    processingNote: contentQuality.issues.length > 0 ? 
      contentQuality.issues.join(', ') : 
      null,
  };
};

/**
 * Create URL-friendly slug from title
 */
export const createSlugFromTitle = (title: string): string => {
  if (!title) return `article-${Date.now()}`;
  
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 100) || `article-${Date.now()}`; // Limit length with fallback
};

/**
 * Validate and enhance article content before saving to database
 */
export const validateAndEnhanceContent = (articleData: any): {
  isValid: boolean;
  enhanced: any;
  warnings: string[];
} => {
  const warnings: string[] = [];
  
  // Clean and enhance content
  const cleanedContent = cleanContentFromTruncation(articleData.content || '');
  const cleanedSummary = cleanContentFromTruncation(articleData.summary || '');
  
  // Validate minimum requirements
  const isValid = cleanedContent.length >= CONTENT_CONFIG.MIN_CONTENT_LENGTH || 
    cleanedSummary.length >= CONTENT_CONFIG.MIN_CONTENT_LENGTH;
  
  if (!isValid) {
    warnings.push('Content and summary are both too short');
  }
  
  // Check for truncation
  if (isContentTruncated(cleanedContent)) {
    warnings.push('Content appears to be truncated');
  }
  
  if (isContentTruncated(cleanedSummary)) {
    warnings.push('Summary appears to be truncated');
  }
  
  // Enhance summary if needed
  let enhancedSummary = cleanedSummary;
  if (!enhancedSummary || enhancedSummary.length < CONTENT_CONFIG.MIN_CONTENT_LENGTH) {
    enhancedSummary = createBetterSummary(
      articleData.title,
      cleanedSummary,
      cleanedContent
    );
    warnings.push('Summary was auto-generated from available content');
  }
  
  const enhanced = {
    ...articleData,
    content: cleanedContent,
    summary: enhancedSummary,
    isContentTruncated: isContentTruncated(articleData.content || ''),
    hasFullContentAtSource: articleData.sourceUrl && (
      isContentTruncated(cleanedContent) || 
      cleanedContent.length < 300
    ),
  };
  
  return {
    isValid,
    enhanced,
    warnings,
  };
};

/**
 * Process bulk articles (for news sync operations)
 */
export const processBulkArticles = (articles: any[]): {
  processed: any[];
  valid: any[];
  invalid: any[];
  warnings: string[];
} => {
  const processed: any[] = [];
  const valid: any[] = [];
  const invalid: any[] = [];
  const warnings: string[] = [];
  
  articles.forEach((article, index) => {
    try {
      const formatted = formatExternalArticle(article);
      const validation = validateAndEnhanceContent(formatted);
      
      processed.push(validation.enhanced);
      
      if (validation.isValid) {
        valid.push(validation.enhanced);
      } else {
        invalid.push(validation.enhanced);
        warnings.push(`Article ${index + 1}: ${validation.warnings.join(', ')}`);
      }
      
      warnings.push(...validation.warnings.map(w => `Article ${index + 1}: ${w}`));
    } catch (error) {
      logger.error('Error processing article', { error, articleIndex: index });
      warnings.push(`Article ${index + 1}: Processing failed`);
    }
  });
  
  return {
    processed,
    valid,
    invalid,
    warnings,
  };
};

/**
 * Generate content preview for API responses
 */
export const generateContentPreview = (article: any): any => {
  return {
    ...article,
    content: createPreview(article.content, 300),
    summary: createPreview(article.summary, 200),
    previewNote: article.isContentTruncated || article.hasFullContentAtSource ? 
      'Preview content. Full article available.' : 
      null,
  };
};

// Export default configuration
export default CONTENT_CONFIG;