"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const prisma = new client_1.PrismaClient();
async function fixUsernames() {
    console.log('🔧 Starting username migration...');
    try {
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
                const baseUsername = user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                let username = baseUsername;
                let attempt = 0;
                if (username.length < 3) {
                    username = `user${username}`;
                }
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
                if (attempt >= 100) {
                    username = `user${user.id.slice(-8)}`;
                }
                await prisma.user.update({
                    where: { id: user.id },
                    data: { username },
                });
                console.log(`✅ Updated user ${user.email} with username: ${username}`);
            }
            catch (error) {
                console.error(`❌ Failed to update user ${user.email}:`, error);
            }
        }
        console.log('✅ Username migration completed');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
fixUsernames()
    .then(() => {
    console.log('🎉 Migration successful');
    process.exit(0);
})
    .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
});
