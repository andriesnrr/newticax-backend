// Express type augmentation for better TypeScript support
import { User } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};