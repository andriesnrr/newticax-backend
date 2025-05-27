import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { env } from '../config/env'; //

// Definisikan class AppError Anda jika belum ada atau impor dari tempat lain
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Untuk membedakan error operasional dengan error programming

    Error.captureStackTrace(this, this.constructor);
  }
}

// Pastikan errorHandler memiliki 4 parameter dan tipe pengembalian void
export const errorHandler: ErrorRequestHandler = (
  err: any, // Bisa juga err: Error | AppError jika Anda yakin hanya itu tipenya
  req: Request,
  res: Response,
  next: NextFunction // Meskipun 'next' tidak dipanggil di semua cabang, ia harus ada untuk signatur error handler
): void => { // Tipe pengembalian eksplisit adalah void
  
  // Log error untuk debugging. Di produksi, Anda mungkin ingin menggunakan logger yang lebih canggih.
  console.error('ERROR 💥:', err.name, '-', err.message);
  if (env.NODE_ENV === 'development') { //
    console.error('STACK 💥:', err.stack);
  }

  // Handle error spesifik dari Prisma
  if (err.code) { 
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || ['field'];
      const field = target.join(', ');
      res.status(400).json({
        success: false,
        message: `A record with this ${field} already exists. Please use a different value.`,
      });
      return; 
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: err.meta?.cause || 'The requested record was not found.',
      });
      return; 
    }
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.',
    });
    return; 
  }
  
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Your token has expired. Please log in again.',
    });
    return; 
  }

  if (err instanceof AppError) {
    if (err.isOperational) {
        res.status(err.statusCode).json({
            success: false, 
            message: err.message,
          });
    } else {
        console.error('PROGRAMMING OR OTHER UNKNOWN AppError 💥:', err);
        res.status(500).json({
            success: false,
            message: 'Something went very wrong on the server!',
          });
    }
    return; 
  }
  
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      message: 'Malformed JSON in request body.',
    });
    return; 
  }

  const finalStatusCode = (err as any).status || (err as any).statusCode || 500;
  const finalMessage = err.message || 'Internal Server Error';
  
  res.status(finalStatusCode).json({
    success: false,
    message: finalMessage,
    ...(env.NODE_ENV === 'development' ? { stack: err.stack, errorName: err.name } : {}), //
  });
};
