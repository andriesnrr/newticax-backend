import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { prisma } from './db';
import { env } from './env';
import { Provider } from '@prisma/client';

export const setupPassport = () => {
  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // JWT Strategy for API authentication
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromExtractors([
          ExtractJwt.fromAuthHeaderAsBearerToken(),
          (req) => {
            if (req && req.cookies) {
              return req.cookies['token'];
            }
            return null;
          },
        ]),
        secretOrKey: env.JWT_SECRET,
      },
      async (payload, done) => {
        try {
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

  // Google OAuth Strategy
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.OAUTH_CALLBACK_URL}/google`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            // Find or create user
            let user = await prisma.user.findFirst({
              where: {
                OR: [
                  { email: profile.emails?.[0]?.value },
                  {
                    AND: [
                      { provider: Provider.GOOGLE },
                      { providerId: profile.id },
                    ],
                  },
                ],
              },
            });

            if (!user) {
              // Create new user
              user = await prisma.user.create({
                data: {
                  name: profile.displayName,
                  email: profile.emails?.[0]?.value || `${profile.id}@google.com`,
                  image: profile.photos?.[0]?.value,
                  provider: Provider.GOOGLE,
                  providerId: profile.id,
                },
              });

              // Create default preferences
              await prisma.preference.create({
                data: {
                  userId: user.id,
                  categories: [],
                },
              });
            } else if (user.provider !== Provider.GOOGLE) {
              // Update existing user with Google provider info
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  provider: Provider.GOOGLE,
                  providerId: profile.id,
                  image: user.image || profile.photos?.[0]?.value,
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

  // GitHub OAuth Strategy
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          callbackURL: `${env.OAUTH_CALLBACK_URL}/github`,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || `${profile.id}@github.com`;
            
            // Find or create user
            let user = await prisma.user.findFirst({
              where: {
                OR: [
                  { email },
                  {
                    AND: [
                      { provider: Provider.GITHUB },
                      { providerId: profile.id },
                    ],
                  },
                ],
              },
            });

            if (!user) {
              // Create new user
              user = await prisma.user.create({
                data: {
                  name: profile.displayName || profile.username || 'GitHub User',
                  email,
                  image: profile.photos?.[0]?.value,
                  provider: Provider.GITHUB,
                  providerId: profile.id,
                },
              });

              // Create default preferences
              await prisma.preference.create({
                data: {
                  userId: user.id,
                  categories: [],
                },
              });
            } else if (user.provider !== Provider.GITHUB) {
              // Update existing user with GitHub provider info
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  provider: Provider.GITHUB,
                  providerId: profile.id,
                  image: user.image || profile.photos?.[0]?.value,
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
