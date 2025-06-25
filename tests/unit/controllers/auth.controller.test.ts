// tests/unit/controllers/auth.controller.test.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { 
  registerHandler, 
  loginHandler, 
  getMeHandler,
  updateProfileHandler,
  updatePasswordHandler
} from '../../../src/controllers/auth.controller';
import { prisma } from '../../../src/config/db';
import { generateToken } from '../../../src/utils/jwt';

jest.mock('../../../src/config/db');
jest.mock('../../../src/utils/jwt');
jest.mock('bcryptjs');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateToken = generateToken as jest.MockedFunction<typeof generateToken>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Auth Controller', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      body: {},
      cookies: {},
      ip: '127.0.0.1',
      get: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  describe('Register Handler', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johndoe',
        password: 'Password123!'
      };

      req.body = userData;

      const hashedPassword = 'hashedPassword123';
      mockBcrypt.genSalt.mockResolvedValue('salt' as never);
      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);

      const createdUser = {
        id: 'user-id-123',
        name: userData.name,
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        role: 'USER',
        language: 'ENGLISH',
        provider: 'EMAIL',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback({
          user: {
            create: jest.fn().mockResolvedValue(createdUser)
          },
          preference: {
            create: jest.fn().mockResolvedValue({})
          }
        } as any);
      });

      mockGenerateToken.mockReturnValue('jwt-token-123');

      await registerHandler(req as Request, res as Response, next);

      expect(mockBcrypt.genSalt).toHaveBeenCalledWith(12);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(userData.password, 'salt');
      expect(mockGenerateToken).toHaveBeenCalledWith(createdUser.id, createdUser.role);
      expect(res.cookie).toHaveBeenCalledWith('token', 'jwt-token-123', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Registration successful'
      }));
    });

    it('should return error if email already exists', async () => {
      req.body = {
        name: 'John Doe',
        email: 'existing@example.com',
        username: 'johndoe',
        password: 'Password123!'
      };

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com'
      } as any);

      await registerHandler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Email already registered',
          statusCode: 400
        })
      );
    });
  });

  describe('Login Handler', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'user@example.com',
        password: 'Password123!'
      };

      req.body = loginData;

      const existingUser = {
        id: 'user-id-123',
        email: loginData.email,
        password: 'hashedPassword',
        role: 'USER',
        preference: {}
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockGenerateToken.mockReturnValue('jwt-token-123');
      mockPrisma.user.update.mockResolvedValue(existingUser as any);

      await loginHandler(req as Request, res as Response, next);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(loginData.password, existingUser.password);
      expect(mockGenerateToken).toHaveBeenCalledWith(existingUser.id, existingUser.role);
      expect(res.cookie).toHaveBeenCalledWith('token', 'jwt-token-123', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Login successful'
      }));
    });

    it('should return error for invalid credentials', async () => {
      req.body = {
        email: 'user@example.com',
        password: 'wrongpassword'
      };

      const existingUser = {
        id: 'user-id-123',
        email: 'user@example.com',
        password: 'hashedPassword'
      };

      mockPrisma.user.findUnique.mockResolvedValue(existingUser as any);
      mockBcrypt.compare.mockResolvedValue(false as never);

      await loginHandler(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid email or password',
          statusCode: 401
        })
      );
    });
  });

  describe('Get Me Handler', () => {
    it('should return user data when authenticated', async () => {
      const user = {
        id: 'user-id-123',
        name: 'John Doe',
        email: 'john@example.com',
        username: 'johndoe'
      };

      req.user = user as any;

      const userWithDetails = {
        ...user,
        preference: {},
        _count: {
          articles: 5,
          bookmarks: 10,
          likes: 15,
          comments: 8
        }
      };

      mockPrisma.user.findUnique.mockResolvedValue(userWithDetails as any);

      await getMeHandler(req as any, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: user.id,
          name: user.name,
          email: user.email
        })
      }));
    });

    it('should return 401 when user not authenticated', async () => {
      req.user = undefined;

      await getMeHandler(req as any, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Authentication required'
      }));
    });
  });

  describe('Update Profile Handler', () => {
    it('should update user profile successfully', async () => {
      const user = { id: 'user-id-123' };
      const updateData = {
        name: 'Updated Name',
        bio: 'Updated bio'
      };

      req.user = user as any;
      req.body = updateData;

      const updatedUser = {
        ...user,
        ...updateData,
        preference: {}
      };

      mockPrisma.user.update.mockResolvedValue(updatedUser as any);

      await updateProfileHandler(req as any, res as Response, next);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: updateData,
        include: { preference: true }
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining(updateData)
      }));
    });
  });
});