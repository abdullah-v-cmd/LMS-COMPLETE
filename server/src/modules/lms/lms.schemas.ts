import { z } from 'zod';

export const createCourseSchema = z.object({
  subjectId: z.string().uuid(),
  sectionId: z.string().uuid(),
  teacherId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  title: z.string().min(2, 'Course title is required'),
  code: z.string().min(2, 'Course code is required'),
  description: z.string().optional(),
  isPublished: z.boolean().default(false),
});

export const createModuleSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1, 'Module title is required'),
  sequenceOrder: z.number().int().default(1),
});

export const createLessonSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().min(1, 'Lesson title is required'),
  contentRichText: z.string().optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  sequenceOrder: z.number().int().default(1),
});

export const createAssignmentSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(2, 'Assignment title is required'),
  instructions: z.string().min(5, 'Instructions are required'),
  maxPoints: z.number().positive().default(100),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  allowLateSubmissions: z.boolean().default(true),
  latePenaltyPercent: z.number().min(0).max(100).default(0),
});

export const submitAssignmentSchema = z.object({
  contentText: z.string().optional(),
  attachmentUrl: z.string().optional(),
});

export const gradeSubmissionSchema = z.object({
  grade: z.number().min(0),
  feedback: z.string().optional(),
});
