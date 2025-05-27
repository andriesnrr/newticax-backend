import passport from 'passport';
import { Strategy as GoogleStrategy, Profile as GoogleProfile, VerifyCallback as GoogleVerifyCallback } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from 'passport-github2';
// Hapus impor JwtPayload jika menyebabkan error TS2305
// import { JwtPayload } from 'passport-jwt'; 
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions, VerifiedCallback as JwtVerifiedCallback } from 'passport-jwt';

import { prisma } from './db';
import { env } from './env';
import { Provider, User as PrismaUser, Role } from '@prisma/client'; // Impor Role jika digunakan di JwtPayload

// Definisikan tipe JwtPayload secara manual sebagai workaround jika impor gagal
interface MyCustomJwtPayload {
  userId: string;
  role?: Role; // Opsional: tambahkan role jika Anda menyimpannya di JWT
  iat?: number;
  exp?: number;
  // Tambahkan properti lain yang Anda harapkan ada di payload JWT Anda
  [key: string]: any; 
}

export const setupPassport = () => {
  passport.serializeUser((user: any, done) => { 
    // user di sini bisa jadi objek PrismaUser lengkap atau objek yang lebih sederhana
    // Pastikan user.id ada. Menggunakan 'as PrismaUser' jika Anda yakin tipenya.
    done(null, (user as PrismaUser).id); 
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      done(null, user); // user akan menjadi PrismaUser | null
    } catch (error) {
      done(error, null);
    }
  });

  const jwtOptions: StrategyOptions = {
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      (req) => {
        let token = null;
        if (req && req.cookies) {
          token = req.cookies['token']; // Sesuaikan dengan nama cookie Anda
        }
        return token;
      },
    ]),
    secretOrKey: env.JWT_SECRET,
  };

  passport.use(
    new JwtStrategy(
      jwtOptions,
      async (payload: MyCustomJwtPayload, done: JwtVerifiedCallback) => { // Gunakan MyCustomJwtPayload
        try {
          if (!payload || !payload.userId) { // Periksa payload dan userId
            return done(null, false, { message: 'Invalid token payload' });
          }
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
          });

          if (!user) {
            return done(null, false);
          }
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.OAUTH_CALLBACK_URL}/google`, // Pastikan path ini benar
        },
        async (accessToken: string, refreshToken: string | undefined, profile: GoogleProfile, done: GoogleVerifyCallback) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error('No email found from Google profile. Please ensure your Google account has a primary email.'), undefined);
            }

            let user = await prisma.user.findFirst({
              where: {
                OR: [
                  { email: email },
                  { provider: Provider.GOOGLE, providerId: profile.id },
                ],
              },
            });

            const generatedUsername = `${profile.name?.givenName?.toLowerCase() || 'guser'}${profile.id.substring(0, 6)}`;

            if (!user) {
              // Pastikan UserCreateInput dari Prisma Client sudah mengenali 'username'
              user = await prisma.user.create({
                data: {
                  name: profile.displayName,
                  email: email,
                  username: generatedUsername, // USERNAME DISERTAKAN
                  image: profile.photos?.[0]?.value,
                  provider: Provider.GOOGLE,
                  providerId: profile.id,
                  // role & language akan menggunakan default dari schema jika ada
                },
              });
              await prisma.preference.create({
                data: { userId: user.id, categories: [] },
              });
            } else if (user.provider !== Provider.GOOGLE || !user.providerId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  provider: Provider.GOOGLE,
                  providerId: profile.id,
                  image: user.image || profile.photos?.[0]?.value,
                  // Jika username belum ada dan user ditemukan via email dari provider lain:
                  ...( !user.username && { username: generatedUsername } )
                },
              });
            }
            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
  }

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          callbackURL: `${env.OAUTH_CALLBACK_URL}/github`, // Pastikan path ini benar
          scope: ['user:email'],
        },
        async (accessToken: string, refreshToken: string | undefined, profile: GitHubProfile, done: (error: any, user?: any, info?: any) => void) => {
          try {
            // GitHub mungkin tidak selalu memberikan email, perlu fallback
            const email = profile.emails?.[0]?.value || (profile.id ? `${profile.username || profile.id}@users.noreply.github.com` : undefined);
            
            if (!email) {
              return done(new Error('Could not retrieve email from GitHub profile. Please ensure your GitHub email is public or set a primary email.'), undefined);
            }
            
            let user = await prisma.user.findFirst({
              where: {
                OR: [
                  { email: email },
                  { provider: Provider.GITHUB, providerId: profile.id },
                ],
              },
            });

            const generatedUsername = `${profile.username || 'ghuser'}${profile.id ? profile.id.substring(0, 6) : Date.now().toString().slice(-6)}`;

            if (!user) {
              // Pastikan UserCreateInput dari Prisma Client sudah mengenali 'username'
              user = await prisma.user.create({
                data: {
                  name: profile.displayName || profile.username || 'GitHub User',
                  email: email,
                  username: generatedUsername, // USERNAME DISERTAKAN
                  image: profile.photos?.[0]?.value,
                  provider: Provider.GITHUB,
                  providerId: profile.id,
                },
              });
              await prisma.preference.create({
                data: { userId: user.id, categories: [] },
              });
            } else if (user.provider !== Provider.GITHUB || !user.providerId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  provider: Provider.GITHUB,
                  providerId: profile.id,
                  image: user.image || profile.photos?.[0]?.value,
                  ...( !user.username && { username: generatedUsername } )
                },
              });
            }
            return done(null, user);
          } catch (error) {
            return done(error as Error, undefined);
          }
        }
      )
    );
  }
};
