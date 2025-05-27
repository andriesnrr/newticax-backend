import { Request } from 'express';
// Impor User dan enum lainnya langsung dari @prisma/client.
// Ini adalah cara paling pasti untuk mendapatkan tipe yang benar berdasarkan skema Anda.
import { 
    User as PrismaClientUser, 
    Language as PrismaLanguageEnum,
    Role as PrismaRoleEnum,
    Provider as PrismaProviderEnum
} from '@prisma/client'; // Pastikan path ini benar dan Prisma Client sudah di-generate dengan benar.

// 1. Definisikan tipe User utama yang akan digunakan di seluruh aplikasi, berdasarkan PrismaClientUser.
// Tipe ini HARUS sudah lengkap dan mencakup field 'username' dan SEMUA field lain dari model User Anda
// setelah 'prisma generate' berhasil dengan schema.prisma yang sudah menyertakan 'username String @unique'.
export type User = PrismaClientUser;

// 2. Definisikan AuthRequest yang menyertakan properti user opsional.
// Ini akan digunakan oleh middleware 'protect' untuk menambahkan user yang terautentikasi ke objek request.
export interface AuthRequest extends Request {
  // Pastikan 'User' di sini adalah tipe yang benar-benar lengkap dari Prisma.
  // Jika 'User' adalah alias dari 'PrismaClientUser', ini seharusnya sudah benar.
  user?: User; 
}

// 3. Re-export enum dari Prisma agar bisa diimpor dari '~/types' jika lebih mudah dan konsisten.
export { PrismaLanguageEnum as Language };
export { PrismaRoleEnum as Role };
export { PrismaProviderEnum as Provider };

// 4. Tipe Input untuk berbagai operasi (DTOs - Data Transfer Objects)

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  username: string; // Dijadikan wajib karena UserCreateInput dari Prisma akan membutuhkannya.
  language?: PrismaLanguageEnum; 
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProfileUpdateInput {
  name?: string;
  bio?: string;
  image?: string | null;
}

export interface PasswordUpdateInput {
  currentPassword?: string; 
  newPassword: string;    
  oldPassword?: string; 
}

export interface ArticleCreateInputDto { 
  title: string;
  content: string;
  summary: string;
  image?: string | null; 
  categoryId?: string | null;
  tagIds?: string[]; 
  language?: PrismaLanguageEnum;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface ArticleUpdateInputDto {
  title?: string;
  content?: string;
  summary?: string;
  image?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  language?: PrismaLanguageEnum;
  isBreaking?: boolean;
  isTrending?: boolean;
  published?: boolean;
  source?: string | null;
  sourceUrl?: string | null;
}

export interface CommentInput {
  content: string;
  parentId?: string | null; 
}

export interface CategoryInput {
  name: string;
  slug?: string; 
  description?: string | null;
  image?: string | null;
}

export interface TagInput {
  name: string;
  slug?: string; 
}

export interface PreferenceInput {
  categories?: string[]; 
  notifications?: boolean;
  darkMode?: boolean;
  emailUpdates?: boolean;
}

// Impor JwtCustomPayload dari utils/jwt.ts
import { JwtCustomPayload } from '../utils/jwt'; //
// Anda bisa menggunakan alias jika mau, atau langsung gunakan JwtCustomPayload di passport.ts
export type MyCustomJwtPayload = JwtCustomPayload; 
