// Passport configuration disabled for Railway deployment
// This file provides minimal compatibility without requiring passport dependencies

import { logger } from '../utils/logger';

// Dummy export to prevent import errors
export const setupPassport = (): void => {
  logger.info('🔐 Passport setup skipped - OAuth disabled for Railway deployment');
  logger.info('ℹ️ Using JWT-only authentication');
};

// Mock passport object for compatibility
export const passport = {
  use: () => {
    logger.warn('Passport.use() called but OAuth is disabled');
  },
  serializeUser: () => {
    logger.warn('Passport.serializeUser() called but OAuth is disabled');
  },
  deserializeUser: () => {
    logger.warn('Passport.deserializeUser() called but OAuth is disabled');
  },
  initialize: () => {
    return (req: any, res: any, next: any) => {
      logger.debug('Passport middleware skipped');
      next();
    };
  },
  session: () => {
    return (req: any, res: any, next: any) => {
      logger.debug('Passport session middleware skipped');
      next();
    };
  }
};

// Export authentication status
export const isOAuthEnabled = (): boolean => false;

export const getAvailableAuthMethods = () => ({
  jwt: true,
  email: true,
  google: false,
  github: false,
  oauth: false
});