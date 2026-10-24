import { Request } from 'express';

export const UserRole = {
  ROLE_SUPER_ADMIN: 'ROLE_SUPER_ADMIN',
  ROLE_INSTITUTION_ADMIN: 'ROLE_INSTITUTION_ADMIN',
  ROLE_ACADEMIC_HEAD: 'ROLE_ACADEMIC_HEAD',
  ROLE_CLASS_TEACHER: 'ROLE_CLASS_TEACHER',
  ROLE_SUBJECT_TEACHER: 'ROLE_SUBJECT_TEACHER',
  ROLE_TEACHING_ASSISTANT: 'ROLE_TEACHING_ASSISTANT',
  ROLE_EXAM_CONTROLLER: 'ROLE_EXAM_CONTROLLER',
  ROLE_FINANCE_HEAD: 'ROLE_FINANCE_HEAD',
  ROLE_FEE_CLERK: 'ROLE_FEE_CLERK',
  ROLE_LIBRARIAN: 'ROLE_LIBRARIAN',
  ROLE_TRANSPORT_COORDINATOR: 'ROLE_TRANSPORT_COORDINATOR',
  ROLE_HOSTEL_WARDEN: 'ROLE_HOSTEL_WARDEN',
  ROLE_COUNSELOR: 'ROLE_COUNSELOR',
  ROLE_PARENT: 'ROLE_PARENT',
  ROLE_STUDENT: 'ROLE_STUDENT',
  ROLE_AUDITOR: 'ROLE_AUDITOR',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

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
