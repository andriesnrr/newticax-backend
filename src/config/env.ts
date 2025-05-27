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
};

// Validasi sederhana untuk variabel penting (opsional tapi direkomendasikan)
if (!env.JWT_SECRET || env.JWT_SECRET === 'your-very-strong-jwt-secret-for-dev-env') {
  console.warn('WARNING: JWT_SECRET is not set or is using a default weak secret. Set a strong JWT_SECRET in your .env file for production.');
}
if (!env.COOKIE_SECRET || env.COOKIE_SECRET === 'your-very-strong-cookie-secret-for-dev-env') {
  console.warn('WARNING: COOKIE_SECRET is not set or is using a default weak secret. Set a strong COOKIE_SECRET in your .env file for production.');
}
if (!env.DATABASE_URL) {
  // Di lingkungan produksi, ini seharusnya menyebabkan aplikasi gagal start.
  // Di dev, mungkin tidak apa-apa jika Anda tidak langsung butuh DB, tapi lebih baik disetel.
  console.error('ERROR: DATABASE_URL is not defined in environment variables. Prisma will likely fail.');
}
