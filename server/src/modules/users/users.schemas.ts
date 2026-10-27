import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character'),
});

export const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character'),
  role: z.nativeEnum(UserRole),
  phone: z.string().optional(),
  institutionId: z.string().uuid('Invalid institution ID').optional(),
  // Conditional profile fields:
  employeeCode: z.string().optional(),
  department: z.string().optional(),
  qualification: z.string().optional(),
  occupation: z.string().optional(),
  emergencyContact: z.string().optional(),
});

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  institutionId: z.string().uuid('Invalid institution ID').optional(),
});
