// scripts/setup-database.ts - Complete database setup for Railway
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

interface CategoryData {
  name: string;
  slug: string;
  description: string;
}

const defaultCategories: CategoryData[] = [
  { name: 'General', slug: 'general', description: 'General news and current events' },
  { name: 'Technology', slug: 'technology', description: 'Latest technology news and innovations' },
  { name: 'Business', slug: 'business', description: 'Business news, markets, and economy' },
  { name: 'Sports', slug: 'sports', description: 'Sports news, scores, and updates' },
  { name: 'Entertainment', slug: 'entertainment', description: 'Entertainment news, movies, and celebrities' },
  { name: 'Health', slug: 'health', description: 'Health news, medical breakthroughs, and wellness' },
  { name: 'Science', slug: 'science', description: 'Scientific discoveries and research news' },
  { name: 'Politics', slug: 'politics', description: 'Political news and government updates' },
  { name: 'World', slug: 'world', description: 'International news and global events' },
  { name: 'Local', slug: 'local', description: 'Local news and community events' },
];

async function setupDatabase() {
  console.log('🚀 Setting up database for Railway deployment...');

  try {
    // Step 1: Test database connection
    console.log('1️⃣ Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful');

    // Step 2: Fix all users without usernames
    console.log('2️⃣ Fixing users without usernames...');
    const usersWithoutUsername = await prisma.user.findMany({
      where: {
        OR: [
          { username: null },
          { username: '' },
        ],
      },
    });

    console.log(`Found ${usersWithoutUsername.length} users without username`);

    for (const user of usersWithoutUsername) {
      const baseUsername = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      let username = baseUsername;
      let attempt = 0;

      // Ensure minimum length
      if (username.length < 3) {
        username = `user${username}`;
      }

      // Make username unique
      while (attempt < 100) {
        const existingUser = await prisma.user.findUnique({
          where: { username },
        });

        if (!existingUser) {
          break;
        }

        attempt++;
        username = `${baseUsername}${attempt}`;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { username },
      });

      console.log(`✅ Fixed username for ${user.email}: ${username}`);
    }

    // Step 3: Create or fix admin user
    console.log('3️⃣ Setting up admin user...');
    
    let admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@newticax.com';
    const adminUsername = process.env.ADMIN_USERNAME || 'superadmin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecureP@ssw0rd!';

    if (!admin) {
      // Create new admin
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);

      admin = await prisma.user.create({
        data: {
          name: 'Super Admin NewticaX',
          email: adminEmail,
          username: adminUsername,
          password: hashedPassword,
          role: 'ADMIN',
          language: 'ENGLISH',
          provider: 'EMAIL',
          bio: 'System Administrator',
        },
      });

      console.log(`✅ Created admin user: ${admin.email}`);
    } else if (!admin.username) {
      // Fix existing admin without username
      await prisma.user.update({
        where: { id: admin.id },
        data: { username: adminUsername },
      });

      console.log(`✅ Fixed admin username: ${adminUsername}`);
    } else {
      console.log(`✅ Admin user already exists: ${admin.email}`);
    }

    // Step 4: Ensure admin has preferences
    const adminPreference = await prisma.preference.findUnique({
      where: { userId: admin.id },
    });

    if (!adminPreference) {
      await prisma.preference.create({
        data: {
          userId: admin.id,
          categories: [],
          notifications: true,
          darkMode: false,
          emailUpdates: true,
        },
      });
      console.log('✅ Created admin preferences');
    }

    // Step 5: Create default categories
    console.log('4️⃣ Setting up default categories...');
    
    let createdCategories = 0;
    let existingCategories = 0;

    for (const categoryData of defaultCategories) {
      const existingCategory = await prisma.category.findUnique({
        where: { slug: categoryData.slug },
      });

      if (!existingCategory) {
        await prisma.category.create({
          data: categoryData,
        });
        createdCategories++;
        console.log(`✅ Created category: ${categoryData.name}`);
      } else {
        existingCategories++;
      }
    }

    console.log(`📊 Categories: ${createdCategories} created, ${existingCategories} already existed`);

    // Step 6: Create sample tags
    console.log('5️⃣ Setting up default tags...');
    
    const defaultTags = [
      'breaking', 'trending', 'featured', 'analysis', 'opinion', 
      'interview', 'review', 'update', 'exclusive', 'investigation'
    ];

    let createdTags = 0;
    for (const tagName of defaultTags) {
      const existingTag = await prisma.tag.findUnique({
        where: { slug: tagName },
      });

      if (!existingTag) {
        await prisma.tag.create({
          data: {
            name: tagName.charAt(0).toUpperCase() + tagName.slice(1),
            slug: tagName,
          },
        });
        createdTags++;
      }
    }

    console.log(`✅ Created ${createdTags} tags`);

    // Step 7: Database statistics
    console.log('6️⃣ Database statistics:');
    const stats = {
      users: await prisma.user.count(),
      admins: await prisma.user.count({ where: { role: 'ADMIN' } }),
      categories: await prisma.category.count(),
      tags: await prisma.tag.count(),
      articles: await prisma.article.count(),
    };

    console.log('📊 Final database statistics:', stats);

    console.log('🎉 Database setup completed successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log(`Email: ${adminEmail}`);
    console.log(`Username: ${adminUsername}`);
    console.log(`Password: ${adminPassword}`);

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup
setupDatabase()
  .then(() => {
    console.log('✅ Setup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });