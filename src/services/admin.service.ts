import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';

// Default admin credentials
const DEFAULT_ADMIN = {
  name: 'Admin',
  email: 'admin@newticax.com',
  password: 'Admin123!',
  role: Role.ADMIN,
};

// Initialize admin user if not exists
export const initializeAdmin = async () => {
  try {
    // Check if admin user exists
    const adminExists = await prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
      },
    });

    if (!adminExists) {
      console.log('Creating default admin user...');
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, salt);

      // Create admin user
      await prisma.user.create({
        data: {
          name: DEFAULT_ADMIN.name,
          email: DEFAULT_ADMIN.email,
          password: hashedPassword,
          role: DEFAULT_ADMIN.role,
        },
      });

      // Create default categories
      await createDefaultCategories();

      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Create default categories
const createDefaultCategories = async () => {
  try {
    const categories = [
      { name: 'General', slug: 'general', description: 'General news category' },
      { name: 'Politics', slug: 'politics', description: 'Politics news category' },
      { name: 'Business', slug: 'business', description: 'Business news category' },
      { name: 'Technology', slug: 'technology', description: 'Technology news category' },
      { name: 'Sports', slug: 'sports', description: 'Sports news category' },
      { name: 'Entertainment', slug: 'entertainment', description: 'Entertainment news category' },
      { name: 'Health', slug: 'health', description: 'Health news category' },
      { name: 'Science', slug: 'science', description: 'Science news category' },
    ];

    for (const category of categories) {
      await prisma.category.upsert({
        where: { slug: category.slug },
        update: {},
        create: category,
      });
    }

    console.log('Default categories created');
  } catch (error) {
    console.error('Error creating default categories:', error);
  }
};
