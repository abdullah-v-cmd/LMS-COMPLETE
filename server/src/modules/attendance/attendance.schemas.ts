import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date must be a valid calendar date');

export const markAttendanceSchema = z.object({
  sectionId: z.string().uuid(),
  date: calendarDate,
  records: z.array(
    z.object({
      studentId: z.string().uuid(),
      status: z.nativeEnum(AttendanceStatus),
      remarks: z.string().max(500).optional(),
    })
  ).min(1, 'At least one student record must be marked').max(500, 'An attendance batch cannot exceed 500 students'),
}).refine((data) => new Set(data.records.map((record) => record.studentId)).size === data.records.length, {
  path: ['records'], message: 'A student may appear only once in an attendance batch',
});

export const markSubjectAttendanceSchema = z.object({
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  date: calendarDate,
  periodNumber: z.number().int().min(1).max(20),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.nativeEnum(AttendanceStatus),
    remarks: z.string().max(500).optional(),
  })).min(1).max(500),
}).refine((data) => new Set(data.records.map((record) => record.studentId)).size === data.records.length, {
  path: ['records'], message: 'A student may appear only once in an attendance batch',
});

const attendanceQueryBaseSchema = z.object({
  sectionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  startDate: calendarDate.optional(),
  endDate: calendarDate.optional(),
});

const dateRangeSchema = <T extends { startDate?: string; endDate?: string }>(schema: z.ZodType<T>) => schema.refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  message: 'startDate must be on or before endDate',
});

export const getAttendanceSchema = dateRangeSchema(attendanceQueryBaseSchema);

export const attendanceSummaryQuerySchema = dateRangeSchema(attendanceQueryBaseSchema.extend({
  thresholdPercent: z.coerce.number().min(1).max(100).default(10),
  minimumSchoolDays: z.coerce.number().int().min(1).max(365).default(10),
}));

export const attendanceRosterParamsSchema = z.object({ sectionId: z.string().uuid() });
export const attendanceRosterQuerySchema = z.object({
  date: calendarDate,
});
export const subjectRosterQuerySchema = z.object({
  date: calendarDate,
  subjectId: z.string().uuid(),
  periodNumber: z.coerce.number().int().min(1).max(20),
});

export const requestCorrectionSchema = z.object({
  attendanceRecordId: z.string().uuid().optional(),
  subjectAttendanceRecordId: z.string().uuid().optional(),
  requestedStatus: z.nativeEnum(AttendanceStatus),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
}).refine((data) => Boolean(data.attendanceRecordId) !== Boolean(data.subjectAttendanceRecordId), {
  message: 'Provide exactly one attendance record ID',
});

export const absenceJustificationSchema = z.object({
  attendanceRecordId: z.string().uuid(),
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(1000),
});

export const reviewCorrectionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

export const reviewCorrectionParamsSchema = z.object({ id: z.string().uuid() });
