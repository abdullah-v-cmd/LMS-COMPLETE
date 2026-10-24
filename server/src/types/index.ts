import { Request } from 'express';
import { UserRole } from '@prisma/client';

export { UserRole };

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  institutionId?: string | null;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  institutionId?: string;
  requestId?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}
