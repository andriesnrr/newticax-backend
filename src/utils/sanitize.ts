import DOMPurify from 'isomorphic-dompurify';
import { logger } from './logger';

interface SanitizeOptions {
  allowHtml?: boolean;
  maxLength?: number;
  stripTags?: boolean;
}

// Sanitize individual string
export const sanitizeString = (
  input: string,
  options: SanitizeOptions = {}
): string => {
  if (typeof input !== 'string') {
    return '';
  }

  const { allowHtml = false, maxLength, stripTags = true } = options;

  let sanitized = input;

  // Remove or escape HTML
  if (!allowHtml && stripTags) {
    sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [] });
  } else if (!allowHtml) {
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  } else {
    // Allow limited HTML tags
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: [],
    });
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    logger.warn('Input truncated due to length', { 
      originalLength: input.length,
      maxLength,
      truncated: true,
    });
  }

  return sanitized;
};

// Sanitize object with multiple fields
export const sanitizeInput = (
  input: Record<string, any>,
  fieldOptions: Record<string, SanitizeOptions> = {}
): Record<string, any> => {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      const options = fieldOptions[key] || {};
      sanitized[key] = sanitizeString(value, options);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' 
          ? sanitizeString(item, fieldOptions[key] || {})
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// Specific sanitizers for common fields
export const sanitizeEmail = (email: string): string => {
  return sanitizeString(email, { maxLength: 254 }).toLowerCase();
};

export const sanitizeName = (name: string): string => {
  return sanitizeString(name, { maxLength: 100 })
    .replace(/[^a-zA-Z\s'-]/g, ''); // Only allow letters, spaces, hyphens, apostrophes
};

export const sanitizeUsername = (username: string): string => {
  return sanitizeString(username, { maxLength: 30 })
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ''); // Only allow lowercase letters, numbers, underscores, hyphens
};

export const sanitizeContent = (content: string): string => {
  return sanitizeString(content, { 
    allowHtml: true,
    maxLength: 50000,
  });
};

export const sanitizeSearchQuery = (query: string): string => {
  return sanitizeString(query, { maxLength: 200 })
    .replace(/[<>'"]/g, ''); // Remove potentially dangerous characters
};