export const env = {
  PORT: parseInt(process.env.PORT || '4000'),
  JWT_SECRET: process.env.JWT_SECRET || 'default-jwt-secret',
  COOKIE_SECRET: process.env.COOKIE_SECRET || 'default-cookie-secret',
  NODE_ENV: process.env.NODE_ENV || 'development',
  COOKIE_EXPIRES: 7 * 24 * 60 * 60 * 1000, // 7 days
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // NewsAPI Configuration
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',
  NEWS_API_BASE_URL: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2',
  
  // OAuth Configuration
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || 'http://localhost:4000/api/auth/callback',
};
