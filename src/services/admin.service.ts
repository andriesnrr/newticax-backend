import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { Role, Language } from '@prisma/client';
import { env } from '../config/env';

// Initialize admin user if not exists - Enhanced for Railway
export const initializeAdmin = async (): Promise<void> => {
  try {
    console.log('👤 Initializing admin user...');
    
    // Use environment variables with fallbacks
    const adminEmail = env.ADMIN_EMAIL || 'admin@newticax.com';
    const adminUsername = env.ADMIN_USERNAME || 'adminnewticax';
    const adminPassword = env.ADMIN_PASSWORD || 'AdminDefaultPassword123!';
    const adminName = 'Super Admin NewticaX';

    console.log(`📧 Admin email: ${adminEmail}`);
    console.log(`👤 Admin username: ${adminUsername}`);

    // Check if admin user exists by email, username, or role
    const adminExists = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminEmail },
          { username: adminUsername },
          { role: Role.ADMIN },
        ],
      },
    });

    if (!adminExists) {
      console.log('🔨 Creating default admin user...');
      
      // Hash password with high salt rounds for security
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);

      // Create admin user in a transaction for safety
      const result = await prisma.$transaction(async (tx) => {
        // Create admin user
        const newAdmin = await tx.user.create({
          data: {
            name: adminName,
            email: adminEmail,
            username: adminUsername,
            password: hashedPassword,
            role: Role.ADMIN,
            language: Language.ENGLISH,
            bio: 'System Administrator',
          },
        });

        // Create default preferences for admin
        await tx.preference.create({
          data: {
            userId: newAdmin.id,
            categories: [],
            notifications: true,
            darkMode: false,
            emailUpdates: true,
          },
        });

        return newAdmin;
      });

      console.log(`✅ Admin user created successfully:`);
      console.log(`   - ID: ${result.id}`);
      console.log(`   - Email: ${result.email}`);
      console.log(`   - Username: ${result.username}`);
      console.log(`   - Role: ${result.role}`);

      // Create default categories after admin is created
      await createDefaultCategories();

    } else {
      console.log(`✅ Admin user already exists:`);
      console.log(`   - ID: ${adminExists.id}`);
      console.log(`   - Email: ${adminExists.email}`);
      console.log(`   - Username: ${adminExists.username}`);
      console.log(`   - Role: ${adminExists.role}`);

      // Still create default categories if they don't exist
      await createDefaultCategories();
    }
  } catch (error) {
    console.error('❌ Error initializing admin:', error);
    
    // Log specific error details for debugging
    if (error instanceof Error) {
      console.error(`   - Error name: ${error.name}`);
      console.error(`   - Error message: ${error.message}`);
    }
    
    // In Railway, we don't want to crash the app if admin creation fails
    // Just log the error and continue
    console.warn('⚠️ Continuing without admin user creation...');
  }
};

// Create default categories - Enhanced with better error handling
const createDefaultCategories = async (): Promise<void> => {
  try {
    console.log('📂 Creating/verifying default categories...');
    
    const categories = [
      { 
        name: 'General', 
        slug: 'general', 
        description: 'General news and current events',
        image: null 
      },
      { 
        name: 'Technology', 
        slug: 'technology', 
        description: 'Latest technology news and innovations',
        image: null 
      },
      { 
        name: 'Business', 
        slug: 'business', 
        description: 'Business news, markets, and economy',
        image: null 
      },
      { 
        name: 'Sports', 
        slug: 'sports', 
        description: 'Sports news, scores, and updates',
        image: null 
      },
      { 
        name: 'Entertainment', 
        slug: 'entertainment', 
        description: 'Entertainment news, movies, and celebrities',
        image: null 
      },
      { 
        name: 'Health', 
        slug: 'health', 
        description: 'Health news, medical breakthroughs, and wellness',
        image: null 
      },
      { 
        name: 'Science', 
        slug: 'science', 
        description: 'Scientific discoveries and research news',
        image: null 
      },
      { 
        name: 'Politics', 
        slug: 'politics', 
        description: 'Political news and government updates',
        image: null 
      },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const categoryData of categories) {
      try {
        const existingCategory = await prisma.category.findUnique({
          where: { slug: categoryData.slug },
        });

        if (!existingCategory) {
          await prisma.category.create({
            data: categoryData,
          });
          createdCount++;
          console.log(`   ✅ Created category: ${categoryData.name}`);
        } else {
          existingCount++;
          console.log(`   ℹ️ Category exists: ${categoryData.name}`);
        }
      } catch (categoryError) {
        console.error(`   ❌ Failed to create category ${categoryData.name}:`, categoryError);
      }
    }

    console.log(`📊 Categories summary:`);
    console.log(`   - Created: ${createdCount}`);
    console.log(`   - Already existed: ${existingCount}`);
    console.log(`   - Total: ${createdCount + existingCount}`);

  } catch (error) {
    console.error('❌ Error creating/verifying default categories:', error);
    
    // Log specific error details
    if (error instanceof Error) {
      console.error(`   - Error name: ${error.name}`);
      console.error(`   - Error message: ${error.message}`);
    }
  }
};

// Create default tags (optional)
export const createDefaultTags = async (): Promise<void> => {
  try {
    console.log('🏷️ Creating/verifying default tags...');
    
    const tags = [
      { name: 'Breaking News', slug: 'breaking-news' },
      { name: 'Trending', slug: 'trending' },
      { name: 'Featured', slug: 'featured' },
      { name: 'Local', slug: 'local' },
      { name: 'International', slug: 'international' },
      { name: 'Analysis', slug: 'analysis' },
      { name: 'Opinion', slug: 'opinion' },
      { name: 'Interview', slug: 'interview' },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const tagData of tags) {
      try {
        const existingTag = await prisma.tag.findUnique({
          where: { slug: tagData.slug },
        });

        if (!existingTag) {
          await prisma.tag.create({
            data: tagData,
          });
          createdCount++;
          console.log(`   ✅ Created tag: ${tagData.name}`);
        } else {
          existingCount++;
        }
      } catch (tagError) {
        console.error(`   ❌ Failed to create tag ${tagData.name}:`, tagError);
      }
    }

    console.log(`🏷️ Tags summary: Created ${createdCount}, Existing ${existingCount}`);

  } catch (error) {
    console.error('❌ Error creating/verifying default tags:', error);
  }
};

// Get admin statistics
export const getAdminStats = async () => {
  try {
    const stats = await prisma.$transaction(async (tx) => {
      const [
        totalUsers,
        totalAdmins,
        totalArticles,
        totalCategories,
        totalTags,
        totalComments,
        totalLikes,
        totalBookmarks,
      ] = await Promise.all([
        tx.user.count(),
        tx.user.count({ where: { role: Role.ADMIN } }),
        tx.article.count(),
        tx.category.count(),
        tx.tag.count(),
        tx.comment.count(),
        tx.like.count(),
        tx.bookmark.count(),
      ]);

      return {
        users: { total: totalUsers, admins: totalAdmins },
        content: { articles: totalArticles, categories: totalCategories, tags: totalTags },
        interactions: { comments: totalComments, likes: totalLikes, bookmarks: totalBookmarks },
      };
    });

    return stats;
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    return null;
  }
};

// Check if system is properly initialized
export const checkSystemHealth = async () => {
  try {
    const health = {
      adminExists: false,
      categoriesExist: false,
      databaseConnected: false,
      errors: [] as string[],
    };

    // Check database connection
    try {
      await prisma.user.findFirst({ take: 1 });
      health.databaseConnected = true;
    } catch (dbError) {
      health.errors.push('Database connection failed');
    }

    // Check if admin exists
    try {
      const admin = await prisma.user.findFirst({
        where: { role: Role.ADMIN },
      });
      health.adminExists = !!admin;
    } catch (adminError) {
      health.errors.push('Admin check failed');
    }

    // Check if categories exist
    try {
      const categoryCount = await prisma.category.count();
      health.categoriesExist = categoryCount > 0;
    } catch (categoryError) {
      health.errors.push('Category check failed');
    }

    return health;
  } catch (error) {
    console.error('❌ Error checking system health:', error);
    return {
      adminExists: false,
      categoriesExist: false,
      databaseConnected: false,
      errors: ['System health check failed'],
    };
  }
};