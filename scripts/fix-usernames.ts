import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

const prisma = new PrismaClient();

async function fixUsernames() {
  console.log('🔧 Starting username migration...');

  try {
    // Find all users without username (using undefined instead of null)
    const usersWithoutUsername = await prisma.user.findMany({
      where: {
        OR: [
          { username: null },
          { username: undefined },
          { username: '' },
        ],
      },
    });

    console.log(`Found ${usersWithoutUsername.length} users without username`);

    if (usersWithoutUsername.length === 0) {
      console.log('✅ All users already have usernames');
      return;
    }

    for (const user of usersWithoutUsername) {
      try {
        // Generate username from email
        const baseUsername = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        let username = baseUsername;
        let attempt = 0;

        // Ensure minimum length
        if (username.length < 3) {
          username = `user${username}`;
        }

        // Check if username is unique
        while (attempt < 100) {
          const existingUser = await prisma.user.findUnique({
            where: { username },
          });

          if (!existingUser) {
            break; // Username is unique
          }

          attempt++;
          username = `${baseUsername}${attempt}`;
        }

        if (attempt >= 100) {
          // Fallback to user ID if we can't generate unique username
          username = `user${user.id.slice(-8)}`;
        }

        // Update user with new username
        await prisma.user.update({
          where: { id: user.id },
          data: { username },
        });

        console.log(`✅ Updated user ${user.email} with username: ${username}`);
      } catch (error) {
        console.error(`❌ Failed to update user ${user.email}:`, error);
      }
    }

    console.log('✅ Username migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
fixUsernames()
  .then(() => {
    console.log('🎉 Migration successful');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });