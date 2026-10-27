import { z } from 'zod';

export const createAcademicYearSchema = z.object({
  name: z.string().min(4, 'e.g. 2026-2027'),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  isCurrent: z.boolean().default(false),
});

export const createClassGradeSchema = z.object({
  programId: z.string().uuid().optional(),
  name: z.string().min(1, 'Class name is required'),
  level: z.coerce.number().int().min(1).max(12),
});

export const createSectionSchema = z.object({
  classGradeId: z.string().uuid(),
  name: z.string().min(1, 'Section name is required'),
  roomNumber: z.string().optional(),
  maxCapacity: z.number().int().default(40),
});

export const createSubjectSchema = z.object({
  name: z.string().min(2, 'Subject name is required'),
  code: z.string().min(2, 'Subject code is required').toUpperCase(),
  creditUnits: z.number().int().default(1),
});

export const assignTeacherSchema = z.object({
  teacherId: z.string().uuid(),
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  isPrimaryTeacher: z.boolean().default(true),
});
