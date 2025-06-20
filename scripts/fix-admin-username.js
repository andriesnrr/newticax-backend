"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const prisma = new client_1.PrismaClient();
async function fixAdminUsername() {
    console.log('🔧 Starting comprehensive admin fix...');
    try {
        const allAdmins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: {
                id: true,
                email: true,
                name: true,
                username: true,
                role: true,
                password: true,
            },
        });
        console.log(`Found ${allAdmins.length} admin user(s):`, allAdmins.map(a => ({
            id: a.id,
            email: a.email,
            username: a.username,
            hasPassword: !!a.password,
        })));
        for (const admin of allAdmins) {
            if (!admin.username) {
                console.log(`Fixing admin ${admin.email} with null username...`);
                const newUsername = process.env.ADMIN_USERNAME || `admin${Date.now()}`;
                try {
                    const updatedAdmin = await prisma.user.update({
                        where: { id: admin.id },
                        data: { username: newUsername },
                    });
                    console.log(`✅ Fixed admin username:`, {
                        id: updatedAdmin.id,
                        email: updatedAdmin.email,
                        username: updatedAdmin.username,
                    });
                }
                catch (updateError) {
                    console.error(`❌ Failed to update admin ${admin.email}:`, updateError);
                }
            }
        }
        if (allAdmins.length === 0) {
            console.log('🔨 No admin users found, creating default admin...');
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@newticax.com';
            const adminUsername = process.env.ADMIN_USERNAME || 'superadmin';
            const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecureP@ssw0rd!';
            const adminName = 'Super Admin NewticaX';
            const salt = await bcryptjs_1.default.genSalt(12);
            const hashedPassword = await bcryptjs_1.default.hash(adminPassword, salt);
            try {
                const newAdmin = await prisma.user.create({
                    data: {
                        name: adminName,
                        email: adminEmail,
                        username: adminUsername,
                        password: hashedPassword,
                        role: 'ADMIN',
                        language: 'ENGLISH',
                        provider: 'EMAIL',
                        bio: 'System Administrator',
                    },
                });
                await prisma.preference.create({
                    data: {
                        userId: newAdmin.id,
                        categories: [],
                        notifications: true,
                        darkMode: false,
                        emailUpdates: true,
                    },
                });
                console.log(`✅ Created new admin user:`, {
                    id: newAdmin.id,
                    email: newAdmin.email,
                    username: newAdmin.username,
                    role: newAdmin.role,
                });
            }
            catch (createError) {
                console.error('❌ Failed to create admin user:', createError);
            }
        }
        console.log('✅ Admin username fix completed successfully');
    }
    catch (error) {
        console.error('❌ Admin username fix failed:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
fixAdminUsername()
    .then(() => {
    console.log('🎉 Admin fix successful');
    process.exit(0);
})
    .catch((error) => {
    console.error('💥 Admin fix failed:', error);
    process.exit(1);
});
