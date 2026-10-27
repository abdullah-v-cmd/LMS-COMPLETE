import { z } from 'zod';

export const parentInfoSchema = z.object({
  firstName: z.string().min(1, 'Parent first name is required'),
  lastName: z.string().min(1, 'Parent last name is required'),
  email: z.string().email('Invalid parent email address'),
  phone: z.string().optional(),
  relationshipType: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']).default('GUARDIAN'),
  occupation: z.string().optional(),
  isPrimaryContact: z.boolean().default(true),
});

export const createStudentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 chars'),
  password: z.string().min(6, 'Password must be at least 6 chars'),
  admissionNumber: z.string().min(1, 'Admission number is required'),
  rollNumber: z.string().optional(),
  sectionId: z.string().uuid('Invalid section ID'),
  dateOfBirth: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  gender: z.string().min(1),
  bloodGroup: z.string().optional(),
  medicalNotes: z.string().optional(),
  emergencyContact: z.string().optional(),
  parent: parentInfoSchema.optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export const linkParentSchema = z.object({
  parentId: z.string().uuid().optional(),
  parentEmail: z.string().email().optional(),
  relationshipType: z.enum(['FATHER', 'MOTHER', 'GUARDIAN']).default('GUARDIAN'),
  isPrimaryContact: z.boolean().default(false),
});

export const changeSectionSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID'),
  reason: z.string().optional(),
});


