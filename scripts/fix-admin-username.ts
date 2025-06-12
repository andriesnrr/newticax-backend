// ===== scripts/fix-admin-username.ts - Fix Admin Username Issue =====

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

const prisma = new PrismaClient();

async function fixAdminUsername() {
  console.log('🔧 Starting admin username fix...');

  try {
    // Find admin user with null username
    const adminUser = await prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        OR: [
          { username: null },
          { username: '' },
        ],
      },
    });

    if (!adminUser) {
      console.log('✅ No admin user with null username found');
      return;
    }

    console.log(`Found admin user with null username:`, {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      username: adminUser.username,
    });

    // Set username to environment variable or default
    const newUsername = process.env.ADMIN_USERNAME || 'superadmin';

    // Check if username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username: newUsername },
    });

    let finalUsername = newUsername;
    if (existingUser && existingUser.id !== adminUser.id) {
      finalUsername = `${newUsername}-admin`;
      console.log(`Username ${newUsername} is taken, using ${finalUsername}`);
    }

    // Update admin user with username
    const updatedUser = await prisma.user.update({
      where: { id: adminUser.id },
      data: { username: finalUsername },
    });

    console.log(`✅ Updated admin user:`, {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      role: updatedUser.role,
    });

    console.log('✅ Admin username fix completed');
  } catch (error) {
    console.error('❌ Admin username fix failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run fix
fixAdminUsername()
  .then(() => {
    console.log('🎉 Admin username fix successful');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Admin username fix failed:', error);
    process.exit(1);
  });