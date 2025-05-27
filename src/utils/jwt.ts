import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { env } from '../config/env'; //
import { Role } from '@prisma/client'; // Impor Role jika Anda ingin menyimpannya di token

// Definisikan tipe untuk payload JWT Anda
// Ekspor interface ini agar bisa digunakan di tempat lain (misalnya di types/index.ts atau passport.ts)
export interface JwtCustomPayload { 
  userId: string;
  role?: Role; // Jadikan role opsional, karena mungkin tidak semua token memilikinya
  // Tambahkan properti standar JWT jika perlu diakses (biasanya ditangani oleh pustaka jwt)
  iat?: number;
  exp?: number;
  // Tambahkan properti lain yang Anda simpan di JWT
  [key: string]: any; // Untuk properti tambahan jika ada
}

// Generate JWT
// Modifikasi untuk menerima role sebagai argumen kedua (opsional)
export const generateToken = (userId: string, userRole?: Role): string => { //
  const payload: JwtCustomPayload = { 
    userId,
  };
  if (userRole) {
    payload.role = userRole;
  }
  
  // Ambil durasi dari env.COOKIE_EXPIRES (dalam milidetik) dan konversi ke format string untuk jwt.sign
  const expiresInMilliseconds = env.COOKIE_EXPIRES; //
  const expiresInSeconds = Math.floor(expiresInMilliseconds / 1000); // Konversi ke detik
  
  return jwt.sign(payload, env.JWT_SECRET, { //
    expiresIn: `${expiresInSeconds}s`, // Format 'Ns' untuk detik, 'Nm' untuk menit, 'Nh' untuk jam, 'Nd' untuk hari
  });
};

// Verify JWT (berguna jika Anda perlu memverifikasi token secara manual di luar Passport)
export const verifyToken = (token: string): JwtCustomPayload | null => {
  try {
    // Pastikan untuk mengetik hasil verify dengan benar
    return jwt.verify(token, env.JWT_SECRET) as JwtCustomPayload; //
  } catch (error) {
    // Lebih baik tidak console.error di sini kecuali untuk debugging mendalam,
    // biarkan pemanggil yang menangani error jika perlu.
    // console.error('Invalid token during verification:', error);
    return null;
  }
};

// Fungsi untuk membersihkan cookie token
export const clearToken = (res: Response): void => {
  res.cookie('token', '', { // Set token menjadi string kosong untuk menghapusnya
    httpOnly: true,
    secure: env.NODE_ENV === 'production', //
    expires: new Date(0), // Set tanggal kedaluwarsa di masa lalu untuk segera menghapus cookie
    sameSite: env.NODE_ENV === 'production' ? 'lax' : 'none', // Sesuaikan dengan pengaturan cookie Anda //
    path: '/', // Umumnya path cookie adalah root, sesuaikan jika berbeda
  });
};
