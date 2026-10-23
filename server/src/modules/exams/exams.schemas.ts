import { z } from 'zod';

export const createExamSessionSchema = z.object({
  academicTermId: z.string().uuid(),
  name: z.string().trim().min(2, 'Session name is required').max(120),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  path: ['endDate'], message: 'endDate must be on or after startDate',
});

export const createExamScheduleSchema = z.object({
  examSessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  examDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:mm format'),
  maxMarks: z.number().positive().max(10000).default(100),
  passMarks: z.number().positive().max(10000).default(40),
  roomNumber: z.string().trim().max(40).optional(),
}).refine((data) => data.passMarks <= data.maxMarks, { path: ['passMarks'], message: 'passMarks cannot exceed maxMarks' })
  .refine((data) => data.startTime < data.endTime, { path: ['endTime'], message: 'endTime must be after startTime' });

export const enterMarksSchema = z.object({
  examScheduleId: z.string().uuid(),
  marks: z.array(
    z.object({
      studentId: z.string().uuid(),
      marksObtained: z.number().min(0),
      isAbsent: z.boolean().default(false),
      remarks: z.string().trim().max(500).optional(),
    }).strict()
  ).min(1, 'At least one mark record is required').max(500, 'A batch cannot exceed 500 students'),
}).refine((data) => new Set(data.marks.map((mark) => mark.studentId)).size === data.marks.length, {
  path: ['marks'], message: 'A student may appear only once in a marks batch',
}).refine((data) => data.marks.every((mark) => !mark.isAbsent || mark.marksObtained === 0), {
  path: ['marks'], message: 'Absent students must have zero marks',
});

export const requestGradeChangeSchema = z.object({
  examMarkId: z.string().uuid(),
  proposedMarks: z.number().min(0),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export const reviewGradeChangeSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

export const publishResultsSchema = z.object({
  examSessionId: z.string().uuid(),
});

export const reviewGradeChangeParamsSchema = z.object({ id: z.string().uuid() });
export const reportCardsQuerySchema = z.object({ studentId: z.string().uuid().optional() });
