import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errorHandler';

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File type validation
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const allowedDocumentTypes = ['application/pdf', 'text/plain', 'application/msword'];
const allowedTypes = [...allowedImageTypes, ...allowedDocumentTypes];

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check file type
  if (!allowedTypes.includes(file.mimetype)) {
    logger.warn('File upload rejected - invalid type', {
      filename: file.originalname,
      mimetype: file.mimetype,
      ip: req.ip,
      userId: (req as any).user?.id,
    });
    
    return cb(new AppError(`File type ${file.mimetype} not allowed`, 400));
  }

  // Check filename for security
  const suspiciousPatterns = [
    /\.php$/i,
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.sh$/i,
    /\.js$/i,
    /\.html$/i,
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
    logger.warn('File upload rejected - suspicious filename', {
      filename: file.originalname,
      ip: req.ip,
      userId: (req as any).user?.id,
    });
    
    return cb(new AppError('Filename not allowed', 400));
  }

  cb(null, true);
};

// Storage configuration
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    // Create user-specific directory
    const userId = (req as any).user?.id || 'anonymous';
    const userDir = path.join(uploadDir, userId);
    
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    
    const filename = `${baseName}_${uniqueSuffix}${extension}`;
    
    logger.info('File upload initiated', {
      originalName: file.originalname,
      newFilename: filename,
      mimetype: file.mimetype,
      userId: (req as any).user?.id,
    });
    
    cb(null, filename);
  },
});

// Memory storage for temporary processing
const memoryStorage = multer.memoryStorage();

// Base multer configuration
const baseMulterConfig = {
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
    files: 5, // Maximum 5 files
    fields: 10, // Maximum 10 form fields
  },
};

// Different upload configurations
export const uploadToFiles = multer({
  storage,
  ...baseMulterConfig,
});

export const uploadToMemory = multer({
  storage: memoryStorage,
  ...baseMulterConfig,
});

// Single file upload middleware
export const uploadSingle = (fieldName: string) => {
  return uploadToFiles.single(fieldName);
};

// Multiple files upload middleware
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => {
  return uploadToFiles.array(fieldName, maxCount);
};

// Multiple fields upload middleware
export const uploadFields = (fields: Array<{ name: string; maxCount?: number }>) => {
  return uploadToFiles.fields(fields);
};

// Image-only upload middleware
export const uploadImage = multer({
  storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(new AppError('Only image files are allowed', 400));
    }
    fileFilter(req, file, cb);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for images
    files: 1,
  },
});

// Avatar upload middleware (smaller size limit)
export const uploadAvatar = multer({
  storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(new AppError('Only image files are allowed for avatar', 400));
    }
    fileFilter(req, file, cb);
  },
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB for avatars
    files: 1,
  },
});

// File cleanup middleware (removes uploaded files on error)
export const cleanupFiles = (req: Request, res: Response, next: NextFunction) => {
  const cleanup = () => {
    const files: Express.Multer.File[] = [];
    
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else {
        Object.values(req.files).forEach(fileArray => {
          if (Array.isArray(fileArray)) {
            files.push(...fileArray);
          } else {
            files.push(fileArray);
          }
        });
      }
    }
    
    files.forEach(file => {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
          logger.info('Cleanup: File removed', { path: file.path });
        } catch (error) {
          logger.error('Cleanup: Failed to remove file', { 
            path: file.path, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    });
  };

  // Store cleanup function for later use
  (res as any).cleanupFiles = cleanup;

  // Use 'finish' event instead of overriding res.end
  res.on('finish', () => {
    // Cleanup files if response status indicates an error
    if (res.statusCode >= 400) {
      cleanup();
    }
  });

  // Also listen to 'close' event for aborted requests
  res.on('close', () => {
    // Always cleanup on connection close/abort
    cleanup();
  });

  next();
};

// Alternative cleanup middleware using error handler
export const cleanupFilesOnError = (req: Request, res: Response, next: NextFunction) => {
  const cleanup = () => {
    const files: Express.Multer.File[] = [];
    
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else {
        Object.values(req.files).forEach(fileArray => {
          if (Array.isArray(fileArray)) {
            files.push(...fileArray);
          } else {
            files.push(fileArray);
          }
        });
      }
    }
    
    files.forEach(file => {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
          logger.info('Error cleanup: File removed', { path: file.path });
        } catch (error) {
          logger.error('Error cleanup: Failed to remove file', { 
            path: file.path, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    });
  };

  // Store cleanup function on request object
  (req as any).cleanupFiles = cleanup;
  
  next();
};

// Manual cleanup function for use in route handlers
export const manualCleanup = (req: Request): void => {
  if ((req as any).cleanupFiles && typeof (req as any).cleanupFiles === 'function') {
    (req as any).cleanupFiles();
  }
};

// File upload error handler middleware
export const handleUploadErrors = (req: Request, res: Response, next: NextFunction) => {
  // This middleware should be used after multer middleware
  // to catch and handle multer-specific errors
  return (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      let message = 'File upload error';
      let statusCode = 400;

      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          message = `File too large. Maximum size is ${Math.round(env.MAX_FILE_SIZE / (1024 * 1024))}MB`;
          break;
        case 'LIMIT_FILE_COUNT':
          message = 'Too many files uploaded';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Unexpected file field name';
          break;
        case 'LIMIT_PART_COUNT':
          message = 'Too many form parts';
          break;
        case 'LIMIT_FIELD_KEY':
          message = 'Field name too long';
          break;
        case 'LIMIT_FIELD_VALUE':
          message = 'Field value too long';
          break;
        case 'LIMIT_FIELD_COUNT':
          message = 'Too many form fields';
          break;
        default:
          message = error.message || 'File upload error';
      }

      logger.error('Multer upload error', {
        code: error.code,
        message: error.message,
        field: error.field,
        ip: req.ip,
        userId: (req as any).user?.id,
      });

      // Cleanup files if they were uploaded before error
      if ((res as any).cleanupFiles) {
        (res as any).cleanupFiles();
      }

      return res.status(statusCode).json({
        success: false,
        message,
        code: error.code,
      });
    }

    // If it's not a multer error, pass it to the next error handler
    next(error);
  };
};

// Get file URL helper
export const getFileUrl = (filepath: string): string => {
  return `/uploads/${filepath.replace(/\\/g, '/')}`;
};

// Delete file helper
export const deleteFile = (filepath: string): void => {
  const fullPath = path.join(uploadDir, filepath);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      logger.info('File deleted', { path: fullPath });
    } catch (error) {
      logger.error('Failed to delete file', { 
        path: fullPath, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

// Get file info helper
export const getFileInfo = (filepath: string): { exists: boolean; size?: number; mtime?: Date } => {
  const fullPath = path.join(uploadDir, filepath);
  try {
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      return {
        exists: true,
        size: stats.size,
        mtime: stats.mtime,
      };
    }
  } catch (error) {
    logger.error('Failed to get file info', { 
      path: fullPath, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
  
  return { exists: false };
};

// Validate uploaded file
export const validateUploadedFile = (file: Express.Multer.File): { valid: boolean; error?: string } => {
  // Check file size
  if (file.size > env.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${Math.round(file.size / (1024 * 1024))}MB exceeds limit of ${Math.round(env.MAX_FILE_SIZE / (1024 * 1024))}MB`,
    };
  }

  // Check file type
  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `File type ${file.mimetype} is not allowed`,
    };
  }

  // Check if file actually exists on disk
  if (file.path && !fs.existsSync(file.path)) {
    return {
      valid: false,
      error: 'Uploaded file not found on disk',
    };
  }

  return { valid: true };
};