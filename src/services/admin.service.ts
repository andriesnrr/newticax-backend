import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { Role, Language } from '@prisma/client'; // Impor Language jika Anda ingin mengatur default language untuk admin
import { env } from '../config/env'; // Impor env untuk mengakses variabel lingkungan

// Initialize admin user if not exists
export const initializeAdmin = async (): Promise<void> => {
  try {
    // Gunakan kredensial dari environment variables jika ada, atau gunakan default
    const adminEmail = env.ADMIN_EMAIL || 'admin@newticax.com';
    const adminUsername = env.ADMIN_USERNAME || 'adminnewticax'; // Tambahkan username untuk admin
    const adminPassword = env.ADMIN_PASSWORD || 'AdminDefaultPassword123!'; // Gunakan password yang lebih kuat
    const adminName = 'Super Admin NewticaX';

    // Check if admin user exists by email, username, or role
    // Lebih baik mencari berdasarkan email atau username karena role bisa dimiliki banyak user
    const adminExists = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminEmail },
          { username: adminUsername },
          // Anda bisa juga menambahkan pengecekan role jika ingin memastikan hanya ada satu admin utama
          // { role: Role.ADMIN }, 
        ],
      },
    });

    if (!adminExists) {
      console.log('Creating default admin user...');
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPassword, salt);

      // Create admin user
      const newAdmin = await prisma.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          username: adminUsername, // <-- USERNAME DITAMBAHKAN DI SINI
          password: hashedPassword,
          role: Role.ADMIN,
          // Anda mungkin ingin mengatur default language jika ada di model User dan wajib
          // language: Language.ENGLISH, // Contoh jika ada field language
          // Field lain yang wajib di model User Anda juga harus diisi di sini
        },
      });
      console.log(`Default admin user created with email: ${newAdmin.email} and username: ${newAdmin.username}`);

      // Create default preferences for the new admin user
      const existingPreference = await prisma.preference.findUnique({
        where: { userId: newAdmin.id },
      });
      if (!existingPreference) {
        await prisma.preference.create({
          data: {
            userId: newAdmin.id,
            categories: [], // Kategori default kosong
            notifications: true, // Default notifikasi aktif
            darkMode: false,     // Default dark mode tidak aktif
            emailUpdates: true,  // Default update email aktif
          },
        });
        console.log(`Default preferences created for admin user: ${newAdmin.username}`);
      }

      // Create default categories (jika ini adalah tempat yang tepat untuk melakukannya)
      await createDefaultCategories();

    } else {
      console.log(`Admin user with email '${adminEmail}' or username '${adminExists.username}' already exists.`);
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
    // Pertimbangkan untuk tidak melempar error di sini agar aplikasi tetap bisa start
    // jika ada masalah minor, kecuali jika keberadaan admin adalah kritikal untuk startup.
  }
};

// Create default categories
const createDefaultCategories = async (): Promise<void> => {
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

    let createdCount = 0;
    for (const categoryData of categories) {
      const existingCategory = await prisma.category.findUnique({
        where: { slug: categoryData.slug },
      });
      if (!existingCategory) {
        await prisma.category.create({
          data: categoryData,
        });
        createdCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`${createdCount} default categories created/verified.`);
    } else {
      console.log('Default categories already exist or no new categories to create.');
    }
  } catch (error) {
    console.error('Error creating/verifying default categories:', error);
  }
};
