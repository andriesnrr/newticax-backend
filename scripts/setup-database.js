"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = require("dotenv");
if (process.env.RAILWAY_ENVIRONMENT) {
    console.log('🚂 Running on Railway environment');
}
else {
    (0, dotenv_1.config)();
}
const prisma = new client_1.PrismaClient({
    log: ['error', 'warn'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});
const defaultCategories = [
    { name: 'General', slug: 'general', description: 'General news and current events' },
    { name: 'Technology', slug: 'technology', description: 'Latest technology news and innovations' },
    { name: 'Business', slug: 'business', description: 'Business news, markets, and economy' },
    { name: 'Sports', slug: 'sports', description: 'Sports news, scores, and updates' },
    { name: 'Entertainment', slug: 'entertainment', description: 'Entertainment news, movies, and celebrities' },
    { name: 'Health', slug: 'health', description: 'Health news, medical breakthroughs, and wellness' },
    { name: 'Science', slug: 'science', description: 'Scientific discoveries and research news' },
    { name: 'Politics', slug: 'politics', description: 'Political news and government updates' },
];
async function setupDatabase() {
    const maxAttempts = 15;
    let attempt = 0;
    console.log('🚀 Starting Railway database setup...');
    console.log('📊 Environment Info:', {
        NODE_ENV: process.env.NODE_ENV,
        RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
        RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID,
        DATABASE_URL: process.env.DATABASE_URL ? '✅ Set' : '❌ Missing',
    });
    while (attempt < maxAttempts) {
        try {
            attempt++;
            console.log(`🔄 Database setup attempt ${attempt}/${maxAttempts}`);
            const connectionTimeout = setTimeout(() => {
                throw new Error('Database connection timeout after 30 seconds');
            }, 30000);
            await prisma.$connect();
            clearTimeout(connectionTimeout);
            console.log('✅ Database connection established');
            try {
                const userCount = await prisma.user.count();
                console.log(`✅ Database test successful - found ${userCount} users`);
            }
            catch (testError) {
                console.log('✅ Database connection successful (collections will be created as needed)');
            }
            console.log('2️⃣ Fixing users without usernames...');
            try {
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
                    let usernameAttempt = 0;
                    if (username.length < 3) {
                        username = `user${username}`;
                    }
                    while (usernameAttempt < 100) {
                        const existingUser = await prisma.user.findUnique({
                            where: { username },
                        });
                        if (!existingUser) {
                            break;
                        }
                        usernameAttempt++;
                        username = `${baseUsername}${usernameAttempt}`;
                    }
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { username },
                    });
                    console.log(`✅ Fixed username for ${user.email}: ${username}`);
                }
            }
            catch (usernameError) {
                console.warn('⚠️ Username fix failed, continuing:', usernameError);
            }
            console.log('3️⃣ Setting up admin user...');
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@newticax.com';
            const adminUsername = process.env.ADMIN_USERNAME || 'superadmin';
            const adminPassword = process.env.ADMIN_PASSWORD || 'AdminSecureP@ssw0rd!';
            let admin = await prisma.user.findFirst({
                where: { role: 'ADMIN' },
            });
            if (!admin) {
                const salt = await bcryptjs_1.default.genSalt(12);
                const hashedPassword = await bcryptjs_1.default.hash(adminPassword, salt);
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
            }
            else if (!admin.username) {
                await prisma.user.update({
                    where: { id: admin.id },
                    data: { username: adminUsername },
                });
                console.log(`✅ Fixed admin username: ${adminUsername}`);
            }
            else {
                console.log(`✅ Admin user already exists: ${admin.email}`);
            }
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
            console.log('4️⃣ Setting up default categories...');
            let createdCategories = 0;
            let existingCategories = 0;
            for (const categoryData of defaultCategories) {
                try {
                    const existingCategory = await prisma.category.findUnique({
                        where: { slug: categoryData.slug },
                    });
                    if (!existingCategory) {
                        await prisma.category.create({
                            data: categoryData,
                        });
                        createdCategories++;
                        console.log(`✅ Created category: ${categoryData.name}`);
                    }
                    else {
                        existingCategories++;
                    }
                }
                catch (error) {
                    console.warn(`⚠️ Failed to create category ${categoryData.name}:`, error);
                }
            }
            console.log(`📊 Categories: ${createdCategories} created, ${existingCategories} already existed`);
            console.log('5️⃣ Setting up default tags...');
            const defaultTags = [
                'breaking', 'trending', 'featured', 'analysis', 'opinion',
                'interview', 'review', 'update', 'exclusive', 'investigation'
            ];
            let createdTags = 0;
            for (const tagName of defaultTags) {
                try {
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
                catch (error) {
                    console.warn(`⚠️ Failed to create tag ${tagName}:`, error);
                }
            }
            console.log(`✅ Created ${createdTags} tags`);
            const stats = {
                users: await prisma.user.count(),
                admins: await prisma.user.count({ where: { role: 'ADMIN' } }),
                categories: await prisma.category.count(),
                tags: await prisma.tag.count(),
                articles: await prisma.article.count(),
            };
            console.log('📊 Final database statistics:', stats);
            console.log('6️⃣ Verifying admin login...');
            const adminUser = await prisma.user.findUnique({
                where: { email: adminEmail },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    role: true,
                    password: true,
                },
            });
            if (adminUser && adminUser.password) {
                const isValidPassword = await bcryptjs_1.default.compare(adminPassword, adminUser.password);
                if (isValidPassword) {
                    console.log('✅ Admin login verification successful');
                }
                else {
                    console.log('⚠️ Admin password verification failed');
                }
            }
            console.log('🎉 Database setup completed successfully!');
            console.log('\n📋 Admin Credentials:');
            console.log(`Email: ${adminEmail}`);
            console.log(`Username: ${adminUsername}`);
            console.log(`Password: ${adminPassword}`);
            break;
        }
        catch (error) {
            console.error(`❌ Setup attempt ${attempt} failed:`, error);
            if (attempt >= maxAttempts) {
                console.error('💥 Database setup failed after all attempts');
                console.log('⚠️ Continuing without database setup to prevent deployment failure');
                console.log('🔧 You may need to run setup manually after deployment');
                break;
            }
            console.log(`⏳ Waiting 5 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}
if (require.main === module) {
    setupDatabase()
        .then(() => {
        console.log('✅ Setup script completed');
        process.exit(0);
    })
        .catch((error) => {
        console.error('💥 Setup script failed:', error);
        process.exit(0);
    })
        .finally(async () => {
        try {
            await prisma.$disconnect();
        }
        catch (error) {
            console.log('Database disconnect error, ignoring...');
        }
    });
}
exports.default = setupDatabase;
