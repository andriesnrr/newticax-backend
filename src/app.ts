import express, { Request, Response, NextFunction } from 'express'; // Ditambahkan Request, Response, NextFunction
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import session from 'express-session';
import { connectDB } from './config/db';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './utils/errorHandler'; // Pastikan errorHandler di file ini memiliki tipe (err, req, res, next) => void
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
  // Pastikan fungsi ini ada dan tidak menyebabkan error saat startup jika API key belum siap
  if (env.NEWS_API_KEY) { // Hanya jalankan jika API key ada
    startNewsAPIFetcher();
  } else {
    console.warn('NEWS_API_KEY not found, NewsAPI fetcher not started.');
  }
}).catch(dbError => {
  console.error('Failed to connect to DB on startup:', dbError);
  // Anda mungkin ingin keluar dari proses jika koneksi DB gagal saat startup
  // process.exit(1); 
});

// Middlewares
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Tambahkan ini untuk parsing form data jika perlu
app.use(cookieParser(env.COOKIE_SECRET));

// Session configuration for OAuth
// Pastikan COOKIE_SECRET benar-benar ada dan kuat
if (!env.COOKIE_SECRET) {
  console.error('FATAL ERROR: COOKIE_SECRET is not defined. OAuth and sessions will not work correctly.');
  // process.exit(1); // Pertimbangkan untuk keluar jika ini kritikal
}

app.use(session({
  secret: env.COOKIE_SECRET, // Harus sama dengan yang digunakan di cookieParser jika ingin berbagi state
  resave: false,
  saveUninitialized: false, // Set true jika ingin menyimpan session baru meskipun belum dimodifikasi (berguna untuk OAuth)
  cookie: {
    secure: env.NODE_ENV === 'production', // Hanya true jika HTTPS
    maxAge: env.COOKIE_EXPIRES, // dalam milidetik
    httpOnly: true,
    sameSite: env.NODE_ENV === 'production' ? 'lax' : undefined, // Pertimbangkan 'lax' atau 'strict' untuk keamanan
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
setupPassport(); // Panggil fungsi setup Passport Anda

// Routes
app.use('/api', routes);

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Error handler middleware
// Pastikan 'errorHandler' di './utils/errorHandler' memiliki signatur:
// (err: any, req: Request, res: Response, next: NextFunction) => void;
// dan tidak me-return hasil dari res.json() atau res.send().
app.use(errorHandler);

// Start server
const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT} in ${env.NODE_ENV} mode`);
});

export default app;
