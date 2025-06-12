import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { Role, Language } from '@prisma/client';
import { env } from '../config/env';

export const initializeAdmin = async (): Promise<void> => {
  try {
    console.log('👤 Initializing admin user...');
    
    const adminEmail = env.ADMIN_EMAIL || 'admin@newticax.com';
    const adminUsername = env.ADMIN_USERNAME || 'superadmin';
    const adminPassword = env.ADMIN_PASSWORD || 'AdminDefaultPassword123!';
    const adminName = 'Super Admin NewticaX';

    console.log(`📧 Admin email: ${adminEmail}`);
    console.log(`👤 Admin username: ${adminUsername}`);

    // FIXED: Check if admin exists with better query
    const adminExists = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminEmail },
          { role: Role.ADMIN },
        ],
      },
    });

    if (adminExists) {
      console.log(`✅ Admin user exists:`, {
        id: adminExists.id,
        email: adminExists.email,
        username: adminExists.username,
        role: adminExists.role,
      });

      // CRITICAL FIX: Update admin username if it's null
      if (!adminExists.username) {
        console.log('🔧 Fixing admin username (currently null)...');
        
        try {
          const updatedAdmin = await prisma.user.update({
            where: { id: adminExists.id },
            data: { username: adminUsername },
          });
          
          console.log(`✅ Admin username fixed:`, {
            id: updatedAdmin.id,
            email: updatedAdmin.email,
            username: updatedAdmin.username,
            role: updatedAdmin.role,
          });
        } catch (updateError) {
          console.error('❌ Failed to update admin username:', updateError);
        }
      }

      await createDefaultCategories();
      return;
    }

    // Create new admin if doesn't exist
    console.log('🔨 Creating default admin user...');
    
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const result = await prisma.$transaction(async (tx) => {
      const newAdmin = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          username: adminUsername, // CRITICAL: Ensure username is set
          password: hashedPassword,
          role: Role.ADMIN,
          language: Language.ENGLISH,
          bio: 'System Administrator',
        },
      });

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

    console.log(`✅ Admin user created successfully:`, {
      id: result.id,
      email: result.email,
      username: result.username,
      role: result.role,
    });

    await createDefaultCategories();

  } catch (error) {
    console.error('❌ Error initializing admin:', error);
    console.warn('⚠️ Continuing without admin user creation...');
  }
};

const createDefaultCategories = async (): Promise<void> => {
  try {
    console.log('📂 Creating/verifying default categories...');
    
    const categories = [
      { name: 'General', slug: 'general', description: 'General news and current events' },
      { name: 'Technology', slug: 'technology', description: 'Latest technology news and innovations' },
      { name: 'Business', slug: 'business', description: 'Business news, markets, and economy' },
      { name: 'Sports', slug: 'sports', description: 'Sports news, scores, and updates' },
      { name: 'Entertainment', slug: 'entertainment', description: 'Entertainment news, movies, and celebrities' },
      { name: 'Health', slug: 'health', description: 'Health news, medical breakthroughs, and wellness' },
      { name: 'Science', slug: 'science', description: 'Scientific discoveries and research news' },
      { name: 'Politics', slug: 'politics', description: 'Political news and government updates' },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const categoryData of categories) {
      try {
        const existingCategory = await prisma.category.findUnique({
          where: { slug: categoryData.slug },
        });

        if (!existingCategory) {
          await prisma.category.create({ data: categoryData });
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

    console.log(`📊 Categories summary: Created ${createdCount}, Existing ${existingCount}`);

  } catch (error) {
    console.error('❌ Error creating/verifying default categories:', error);
  }
};