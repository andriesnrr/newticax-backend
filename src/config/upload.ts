import path from 'path';
import { env } from './env';

export const uploadConfig = {
  // File size limits (in bytes)
  limits: {
    fileSize: env.MAX_FILE_SIZE || 5 * 1024 * 1024, // 5MB default
    files: 5, // Maximum number of files
    fields: 10, // Maximum number of form fields
    parts: 15, // Maximum number of parts
  },

  // Allowed file types
  allowedTypes: {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    documents: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    all: [] as string[], // Will be populated below
  },

  // File paths
  paths: {
    base: env.UPLOAD_DIR || 'uploads',
    avatars: 'avatars',
    articles: 'articles',
    documents: 'documents',
    temp: 'temp',
  },

  // File naming
  naming: {
    maxLength: 100,
    allowedChars: /^[a-zA-Z0-9._-]+$/,
    preserveExtension: true,
    addTimestamp: true,
    addRandomSuffix: true,
  },

  // Security settings
  security: {
    scanForViruses: false, // Enable if you have antivirus integration
    allowExecutables: false,
    maxFilenameLength: 255,
    quarantineDir: 'quarantine',
  },

  // Image processing settings
  images: {
    enableProcessing: true,
    formats: {
      thumbnail: { width: 150, height: 150, quality: 80 },
      medium: { width: 500, height: 300, quality: 85 },
      large: { width: 1200, height: 800, quality: 90 },
    },
    defaultFormat: 'webp',
    preserveOriginal: true,
  },

  // Storage settings
  storage: {
    type: 'local', // 'local' | 's3' | 'gcs' | 'azure'
    cleanup: {
      tempFiles: 24 * 60 * 60 * 1000, // 24 hours
      orphanedFiles: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  },

  // CDN settings (for future use)
  cdn: {
    enabled: false,
    baseUrl: '',
    cacheTtl: 31536000, // 1 year
  },
};

// Populate all allowed types
uploadConfig.allowedTypes.all = [
  ...uploadConfig.allowedTypes.images,
  ...uploadConfig.allowedTypes.documents,
];

// Helper functions
export const getUploadPath = (category: string, filename?: string): string => {
  const basePath = path.join(process.cwd(), uploadConfig.paths.base, category);
  return filename ? path.join(basePath, filename) : basePath;
};

export const getPublicUrl = (filepath: string): string => {
  const publicPath = filepath.replace(/\\/g, '/');
  return uploadConfig.cdn.enabled 
    ? `${uploadConfig.cdn.baseUrl}/${publicPath}`
    : `/uploads/${publicPath}`;
};

export const isAllowedFileType = (mimetype: string, category: 'images' | 'documents' | 'all' = 'all'): boolean => {
  return uploadConfig.allowedTypes[category].includes(mimetype);
};

export const generateUniqueFilename = (originalName: string, userId?: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  const name = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);
  
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const userPrefix = userId ? `${userId}_` : '';
  
  return `${userPrefix}${name}_${timestamp}_${random}${ext}`;
};

export const validateFileName = (filename: string): { valid: boolean; error?: string } => {
  if (filename.length > uploadConfig.security.maxFilenameLength) {
    return { valid: false, error: 'Filename too long' };
  }

  if (!uploadConfig.naming.allowedChars.test(filename)) {
    return { valid: false, error: 'Filename contains invalid characters' };
  }

  const ext = path.extname(filename).toLowerCase();
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.php'];
  
  if (dangerousExtensions.includes(ext)) {
    return { valid: false, error: 'File type not allowed for security reasons' };
  }

  return { valid: true };
};

export default uploadConfig;