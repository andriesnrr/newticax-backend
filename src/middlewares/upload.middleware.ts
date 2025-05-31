import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
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
    const files = [];
    
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
        fs.unlinkSync(file.path);
        logger.info('Cleanup: File removed', { path: file.path });
      }
    });
  };

  // Override res.end to cleanup files on error
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding: any) {
    if (res.statusCode >= 400) {
      cleanup();
    }
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Get file URL helper
export const getFileUrl = (filepath: string): string => {
  return `/uploads/${filepath.replace(/\\/g, '/')}`;
};

// Delete file helper
export const deleteFile = (filepath: string): void => {
  const fullPath = path.join(uploadDir, filepath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    logger.info('File deleted', { path: fullPath });
  }
};