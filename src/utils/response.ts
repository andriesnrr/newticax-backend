import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  meta?: any;
  errors?: any[];
}

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  options: {
    data?: T;
    message?: string;
    pagination?: any;
    meta?: any;
    errors?: any[];
  } = {}
): void => {
  const { data, message, pagination, meta, errors } = options;
  
  const response: ApiResponse<T> = {
    success: statusCode < 400,
    ...(message && { message }),
    ...(data !== undefined && { data }),
    ...(pagination && { pagination }),
    ...(meta && { meta }),
    ...(errors && { errors }),
  };
  
  res.status(statusCode).json(response);
};

// Success responses
export const sendSuccess = <T>(
  res: Response,
  data?: T,
  message?: string,
  pagination?: any,
  meta?: any
): void => {
  sendResponse(res, 200, { data, message, pagination, meta });
};

export const sendCreated = <T>(
  res: Response,
  data?: T,
  message?: string
): void => {
  sendResponse(res, 201, { data, message });
};

export const sendNoContent = (res: Response): void => {
  res.status(204).send();
};

// Error responses
export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: any[]
): void => {
  sendResponse(res, statusCode, { message, errors });
};

export const sendBadRequest = (
  res: Response,
  message: string = 'Bad Request',
  errors?: any[]
): void => {
  sendError(res, 400, message, errors);
};

export const sendUnauthorized = (
  res: Response,
  message: string = 'Unauthorized'
): void => {
  sendError(res, 401, message);
};

export const sendForbidden = (
  res: Response,
  message: string = 'Forbidden'
): void => {
  sendError(res, 403, message);
};

export const sendNotFound = (
  res: Response,
  message: string = 'Not Found'
): void => {
  sendError(res, 404, message);
};

export const sendConflict = (
  res: Response,
  message: string = 'Conflict'
): void => {
  sendError(res, 409, message);
};

export const sendInternalError = (
  res: Response,
  message: string = 'Internal Server Error'
): void => {
  sendError(res, 500, message);
};