import dotenv from 'dotenv';

// Pastikan dotenv.config() dipanggil di paling atas
dotenv.config();

export const env = {
  // Server Configuration
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // FIXED: Enhanced CORS configuration for Vercel
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://newticax.vercel.app,http://localhost:3000',
  
  // Security and Session - ENHANCED for cross-origin
  JWT_SECRET: process.env.JWT_SECRET || 'your-very-strong-jwt-secret-for-dev-env',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'your-very-strong-cookie-secret-for-dev-env',
  COOKIE_EXPIRES: parseInt(process.env.COOKIE_EXPIRES || (7 * 24 * 60 * 60 * 1000).toString(), 10), // 7 days

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Redis Configuration (Optional for Railway)
  REDIS_URL: process.env.REDIS_URL || '',

  // NewsAPI Configuration
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',
  NEWS_API_BASE_URL: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
  
  // OAuth Configuration (Optional)
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || 'https://newticax-backend-production.up.railway.app/api/auth/callback', 

  // Admin User Configuration
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@newticax.com',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'superadmin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'AdminSecureP@ssw0rd!',

  // FIXED: Frontend URL configuration
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://newticax.vercel.app',

  // Email Configuration (Optional)
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  FROM_EMAIL: process.env.FROM_EMAIL || 'noreply@newticax.com',

  // Upload Configuration
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || (5 * 1024 * 1024).toString(), 10), // 5MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'logs/app.log',

  // Rate Limiting
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || (15 * 60 * 1000).toString(), 10), // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '50', 10), // Increased for production

  // Cache
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour
  NEWS_CACHE_TTL: parseInt(process.env.NEWS_CACHE_TTL || '1800', 10), // 30 minutes
};

// Enhanced validation function for Railway + Vercel
export const validateEnv = (): void => {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('🔍 Validating environment variables...');

  // Required variables for production
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'COOKIE_SECRET',
  ];

  // Check required variables
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      errors.push(`${varName} is required but not set`);
    } else {
      console.log(`✅ ${varName}: Set`);
    }
  }

  // Validate specific formats
  if (env.DATABASE_URL && !env.DATABASE_URL.startsWith('mongodb://') && !env.DATABASE_URL.startsWith('mongodb+srv://')) {
    errors.push('DATABASE_URL must be a valid MongoDB connection string');
  }

  if (env.PORT < 1 || env.PORT > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }

  // Enhanced production validations for Railway + Vercel
  if (env.NODE_ENV === 'production') {
    console.log('🔒 Running production validations for Railway + Vercel...');
    
    // Check for weak secrets in production
    if (env.JWT_SECRET === 'your-very-strong-jwt-secret-for-dev-env') {
      errors.push('JWT_SECRET must be changed from default value in production');
    }

    if (env.COOKIE_SECRET === 'your-very-strong-cookie-secret-for-dev-env') {
      errors.push('COOKIE_SECRET must be changed from default value in production');
    }

    if (env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long in production');
    }

    if (env.COOKIE_SECRET.length < 32) {
      warnings.push('COOKIE_SECRET should be at least 32 characters long in production');
    }

    // Enhanced CORS origin validation for Vercel
    const expectedOrigins = ['https://newticax.vercel.app', 'https://newticax-frontend.vercel.app'];
    const hasValidOrigin = expectedOrigins.some(origin => env.CORS_ORIGIN.includes(origin));
    
    if (!hasValidOrigin) {
      warnings.push(`CORS_ORIGIN should include production domains. Current: ${env.CORS_ORIGIN}`);
    }

    // Frontend URL validation
    if (!env.FRONTEND_URL.startsWith('https://')) {
      warnings.push('FRONTEND_URL should use HTTPS in production');
    }

    if (env.FRONTEND_URL.includes('localhost')) {
      warnings.push('FRONTEND_URL should not point to localhost in production');
    }

    // Cookie security validation
    console.log('🍪 Cookie configuration for production:', {
      httpOnly: true,
      secure: true, // Always true in production
      sameSite: 'none', // Required for cross-origin (Railway + Vercel)
      domain: 'auto', // Let browser handle domain
    });
  }

  // Optional feature warnings
  if (!env.NEWS_API_KEY) {
    warnings.push('NEWS_API_KEY not set - news fetching will be disabled');
  }

  if (!env.SMTP_HOST) {
    warnings.push('Email service not configured - email features will be disabled');
  }

  if (!env.REDIS_URL || env.REDIS_URL === 'redis://localhost:6379') {
    warnings.push('Redis not configured - using in-memory cache fallback');
  }

  // OAuth warnings (disabled for Railway)
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    warnings.push('Google OAuth not configured - social login disabled');
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    warnings.push('GitHub OAuth not configured - social login disabled');
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  // Handle errors
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (env.NODE_ENV === 'production') {
      console.error('Exiting due to environment validation errors in production');
      process.exit(1);
    } else {
      console.warn('⚠️  Continuing in development mode with warnings');
    }
  } else {
    console.log('✅ Environment validation passed');
  }

  // Enhanced configuration summary for Railway + Vercel
  console.log('📋 Configuration Summary:', {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    CORS_ORIGIN: env.CORS_ORIGIN,
    FRONTEND_URL: env.FRONTEND_URL,
    DATABASE_CONFIGURED: !!env.DATABASE_URL,
    REDIS_CONFIGURED: !!env.REDIS_URL && env.REDIS_URL !== 'redis://localhost:6379',
    EMAIL_CONFIGURED: !!env.SMTP_HOST,
    NEWS_API_CONFIGURED: !!env.NEWS_API_KEY,
    GOOGLE_OAUTH_CONFIGURED: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    GITHUB_OAUTH_CONFIGURED: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    COOKIE_CONFIG: {
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      httpOnly: true,
      crossOrigin: true,
    },
  });

  // Log deployment-specific info
  if (env.NODE_ENV === 'production') {
    console.log('🚀 Railway + Vercel Deployment Configuration:');
    console.log('  - Backend: Railway (with trust proxy)');
    console.log('  - Frontend: Vercel');
    console.log('  - Cross-origin cookies: Enabled');
    console.log('  - HTTPS: Required');
    console.log('  - SameSite: none (for cross-origin)');
    console.log('  - Secure: true');
  }
};