import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { AppError } from '../utils/errorHandler';
import { LoginInput, RegisterInput } from '../types'; // Pastikan tipe ini sesuai
import { User, Role, Language, Provider } from '@prisma/client'; // Impor semua tipe yang relevan dari User model jika digunakan di sini

export const register = async ({
  name,
  email,
  password,
  // username, // Jika Anda ingin username diinput dari RegisterInput
}: RegisterInput): Promise<User> => {
  // Check if user with email already exists
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUserByEmail) {
    throw new AppError('Email sudah terdaftar', 400);
  }

  // --- Pembuatan Username ---
  // Model User Anda memiliki 'username String @unique'. Anda perlu menyediakannya.
  // Contoh sederhana: ambil bagian dari email sebelum '@' dan tambahkan angka acak.
  // Anda HARUS memastikan keunikan username ini di database.
  // Logika ini mungkin perlu disesuaikan.
  const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ''); // Bersihkan karakter non-alfanumerik
  let potentialUsername = baseUsername;
  let usernameIsUnique = false;
  let attempt = 0;

  while (!usernameIsUnique && attempt < 10) { // Batasi percobaan untuk menghindari loop tak terbatas
    const existingUserByUsername = await prisma.user.findUnique({
      where: { username: potentialUsername },
    });
    if (!existingUserByUsername) {
      usernameIsUnique = true;
    } else {
      attempt++;
      potentialUsername = `${baseUsername}${Math.floor(Math.random() * 1000)}`;
    }
  }

  if (!usernameIsUnique) {
    // Jika setelah beberapa percobaan username unik tidak ditemukan,
    // Anda bisa melempar error atau menggunakan strategi lain.
    // Untuk sekarang, kita akan menggunakan email dengan timestamp jika gagal.
    potentialUsername = `${baseUsername}${Date.now()}`; 
    // Peringatan: Ini masih bisa berpotensi tidak unik dalam skenario konkurensi tinggi,
    // idealnya ada constraint database atau mekanisme retry yang lebih baik.
    const finalCheck = await prisma.user.findUnique({ where: { username: potentialUsername }});
    if (finalCheck) {
        throw new AppError('Gagal membuat username unik setelah beberapa percobaan.', 500);
    }
  }
  // --- Akhir Pembuatan Username ---


  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create new user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      username: potentialUsername, // Tambahkan username yang sudah dibuat
      password: hashedPassword,
      // role, language, provider akan menggunakan nilai default dari schema.prisma
      // atau bisa disetel di sini jika RegisterInput menyediakannya.
      // Contoh: role: Role.USER, language: Language.ENGLISH (jika ini defaultnya)
    },
  });

  // Buat preferensi default untuk user baru
  // Ini sebaiknya dilakukan di sini jika setiap user harus punya preferensi
  await prisma.preference.create({
    data: {
      userId: user.id,
      categories: [], // Kategori default kosong
      // field lain di Preference akan menggunakan default dari schema
    }
  });

  return user;
};

export const login = async ({
  email,
  password,
}: LoginInput): Promise<User> => {
  // Check if user exists
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError('Email atau password salah', 401);
  }

  // **PERBAIKAN UTAMA DI SINI**
  // Pastikan user.password ada sebelum membandingkan
  if (!user.password) {
    // Ini bisa terjadi jika user mendaftar melalui OAuth dan belum mengatur password lokal
    throw new AppError('Password tidak diatur untuk akun ini. Coba login dengan metode lain.', 400);
  }

  // Compare passwords
  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new AppError('Email atau password salah', 401);
  }

  return user;
};

// Fungsi ini sepertinya sudah benar, tapi pastikan tipe User yang dikembalikan
// adalah yang diharapkan oleh pemanggil.
export const getUserById = async (userId: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Anda mungkin ingin menyertakan relasi tertentu di sini, tergantung kebutuhan
    // include: { preference: true } 
  });

  // Mengembalikan null jika user tidak ditemukan, bukan melempar error,
  // agar controller bisa memutuskan cara menangani kasus 'tidak ditemukan'.
  // Jika Anda ingin tetap melempar error, kembalikan Promise<User> dan hapus ' | null '.
  if (!user) {
    // throw new AppError('User tidak ditemukan', 404); // Opsi 1: Lempar Error
    return null; // Opsi 2: Kembalikan null
  }

  return user;
};

// Anda mungkin juga memerlukan fungsi untuk menangani pembuatan atau pencarian user dari OAuth
// Contoh (perlu disesuaikan dengan logika di passport.ts Anda):
export const findOrCreateUserFromProvider = async (
  provider: Provider, // Enum Provider dari @prisma/client
  profileId: string,
  email: string | null, // Email bisa null dari beberapa provider
  name: string,
  imageUrl?: string | null
): Promise<User> => {
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { provider: provider, providerId: profileId },
        ...(email ? [{ email: email }] : []), // Cari berdasarkan email jika ada
      ],
    },
  });

  const safeEmail = email || `${profileId}@${provider.toString().toLowerCase()}.placeholder.com`; // Fallback email jika null
  
  // Buat username unik
  const baseUsername = (name.split(' ')[0] || provider.toString().toLowerCase() + profileId.substring(0,5)).replace(/[^a-zA-Z0-9]/g, '');
  let potentialUsername = baseUsername;
  let usernameIsUnique = false;
  let attempt = 0;
  while (!usernameIsUnique && attempt < 10) {
    const existingUserByUsername = await prisma.user.findUnique({ where: { username: potentialUsername }});
    if (!existingUserByUsername) usernameIsUnique = true;
    else { attempt++; potentialUsername = `${baseUsername}${Math.floor(Math.random() * 1000)}`; }
  }
   if (!usernameIsUnique) potentialUsername = `${baseUsername}${Date.now()}`;
   const finalCheck = await prisma.user.findUnique({ where: { username: potentialUsername }});
   if (finalCheck && finalCheck.id !== user?.id) { // Pastikan tidak konflik dengan user yang mungkin sudah ada (jika email match)
        potentialUsername = `${baseUsername}${profileId.substring(0,3)}${Date.now()}`;
   }


  if (!user) {
    // User tidak ditemukan, buat user baru
    user = await prisma.user.create({
      data: {
        name,
        email: safeEmail,
        username: potentialUsername,
        image: imageUrl,
        provider: provider,
        providerId: profileId,
        // Password bisa null untuk OAuth users
        // Role dan language akan menggunakan default dari schema
      },
    });
    // Buat preferensi default untuk user baru
    await prisma.preference.create({
      data: { userId: user.id, categories: [] },
    });
  } else {
    // User ditemukan, update informasi provider jika belum ada atau berbeda
    if (user.provider !== provider || !user.providerId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          provider: provider,
          providerId: profileId,
          image: user.image || imageUrl, // Update image jika belum ada atau dari provider baru
          // Pastikan email tidak dioverwrite jika sudah ada dan terverifikasi
          email: user.email && user.email !== safeEmail ? user.email : safeEmail,
        },
      });
    }
  }
  return user;
};
