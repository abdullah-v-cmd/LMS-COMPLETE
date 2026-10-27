import { UserRole as AppUserRole } from './index';

declare module '@prisma/client' {
  export const UserRole: typeof AppUserRole;
  export type UserRole = AppUserRole;
}
