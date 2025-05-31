import dotenv from 'dotenv';

// Pastikan dotenv.config() dipanggil di paling atas
dotenv.config();

export const env = {
  // Server Configuration
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Security and Session
  JWT_SECRET: process.env.JWT_SECRET || 'your-very-strong-jwt-secret-for-dev-env',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'your-very-strong-cookie-secret-for-dev-env',
  COOKIE_EXPIRES: parseInt(process.env.COOKIE_EXPIRES || (7 * 24 * 60 * 60 * 1000).toString(), 10), // 7 days

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Redis Configuration
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // NewsAPI Configuration
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',
  NEWS_API_BASE_URL: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
  
  // OAuth Configuration
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || 'http://localhost:4000/api/auth/callback', 

  // Admin User Configuration
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@newticax.com',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'superadminnewticax',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'AdminSecureP@ssw0rd!',

  // Frontend URL
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Email Configuration
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
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),

  // Cache
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour
  NEWS_CACHE_TTL: parseInt(process.env.NEWS_CACHE_TTL || '1800', 10), // 30 minutes
};

// Validation function
export const validateEnv = (): void => {
  const errors: string[] = [];

  // Required variables for all environments
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'COOKIE_SECRET',
  ];

  // Additional required variables for production
  if (env.NODE_ENV === 'production') {
    requiredVars.push(
      'NEWS_API_KEY',
      'ADMIN_EMAIL',
      'ADMIN_USERNAME',
      'ADMIN_PASSWORD'
    );
  }

  // Check required variables
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      errors.push(`${varName} is required but not set`);
    }
  }

  // Validate specific formats
  if (env.DATABASE_URL && !env.DATABASE_URL.startsWith('mongodb://') && !env.DATABASE_URL.startsWith('mongodb+srv://')) {
    errors.push('DATABASE_URL must be a valid MongoDB connection string');
  }

  if (env.PORT < 1 || env.PORT > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }

  if (env.NODE_ENV === 'production') {
    // Check for weak secrets in production
    if (env.JWT_SECRET === 'your-very-strong-jwt-secret-for-dev-env') {
      errors.push('JWT_SECRET must be changed from default value in production');
    }

    if (env.COOKIE_SECRET === 'your-very-strong-cookie-secret-for-dev-env') {
      errors.push('COOKIE_SECRET must be changed from default value in production');
    }

    if (env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters long in production');
    }

    if (env.COOKIE_SECRET.length < 32) {
      errors.push('COOKIE_SECRET should be at least 32 characters long in production');
    }

    // Check CORS origin
    if (env.CORS_ORIGIN === 'http://localhost:3000') {
      errors.push('CORS_ORIGIN should be set to production domain(s)');
    }
  }

  // Email configuration validation
  if (env.SMTP_HOST && (!env.SMTP_USER || !env.SMTP_PASS)) {
    errors.push('SMTP_USER and SMTP_PASS are required when SMTP_HOST is set');
  }

  // OAuth configuration validation
  const hasGoogleOAuth = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET;
  const hasGitHubOAuth = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET;
  
  if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
    errors.push('GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set');
  }
  
  if (env.GITHUB_CLIENT_ID && !env.GITHUB_CLIENT_SECRET) {
    errors.push('GITHUB_CLIENT_SECRET is required when GITHUB_CLIENT_ID is set');
  }

  // If there are errors, log them and exit
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
};

// Warnings for development
if (env.NODE_ENV === 'development') {
  const warnings: string[] = [];

  if (env.JWT_SECRET === 'your-very-strong-jwt-secret-for-dev-env') {
    warnings.push('Using default JWT_SECRET (not recommended even for development)');
  }

  if (env.COOKIE_SECRET === 'your-very-strong-cookie-secret-for-dev-env') {
    warnings.push('Using default COOKIE_SECRET (not recommended even for development)');
  }

  if (!env.NEWS_API_KEY) {
    warnings.push('NEWS_API_KEY not set - news fetching will be disabled');
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Development warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
}