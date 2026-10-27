import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Unhandled Application Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });

  if (err instanceof ZodError) {
    const primaryMsg = err.issues[0]?.message || 'The requested payload failed validation.';
    return sendError(
      res,
      400,
      'VALIDATION_FAILED',
      primaryMsg,
      err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
    );
  }

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return sendError(res, 401, 'UNAUTHORIZED', err.message || 'Authentication required');
  }

  if (err.status === 403) {
    return sendError(res, 403, 'FORBIDDEN', err.message || 'Access denied');
  }

  if (err.code === 'P2002') {
    return sendError(
      res,
      409,
      'CONFLICT',
      'A record with these unique fields already exists.'
    );
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected internal server error occurred.'
      : err.message || 'Internal server error';

  return sendError(res, statusCode, 'INTERNAL_SERVER_ERROR', message);
};
