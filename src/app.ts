import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import { connectDB } from './config/db';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './utils/errorHandler';
import { setupPassport } from './config/passport';
import { startNewsAPIFetcher } from './services/news-api.service';
import { initializeAdmin } from './services/admin.service';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Connect to database
connectDB().then(() => {
  // Initialize admin user if not exists
  initializeAdmin();
  
  // Start the NewsAPI fetcher for background updates
  startNewsAPIFetcher();
});

// Middlewares
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser(env.COOKIE_SECRET));

// Session configuration for OAuth
app.use(session({
  secret: env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    maxAge: env.COOKIE_EXPIRES,
    httpOnly: true,
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
setupPassport();

// Routes
app.use('/api', routes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Error handler middleware
app.use(errorHandler);

// Start server
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;