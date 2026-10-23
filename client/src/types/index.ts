export type UserRole =
  | 'ROLE_SUPER_ADMIN'
  | 'ROLE_INSTITUTION_ADMIN'
  | 'ROLE_ACADEMIC_HEAD'
  | 'ROLE_CLASS_TEACHER'
  | 'ROLE_SUBJECT_TEACHER'
  | 'ROLE_TEACHING_ASSISTANT'
  | 'ROLE_EXAM_CONTROLLER'
  | 'ROLE_FINANCE_HEAD'
  | 'ROLE_FEE_CLERK'
  | 'ROLE_LIBRARIAN'
  | 'ROLE_TRANSPORT_COORDINATOR'
  | 'ROLE_HOSTEL_WARDEN'
  | 'ROLE_COUNSELOR'
  | 'ROLE_PARENT'
  | 'ROLE_STUDENT'
  | 'ROLE_AUDITOR';

export interface User {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  institutionId?: string | null;
  institutionName?: string | null;
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
