import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date must be a valid calendar date');

export const createLeaveSchema = z.object({
  leaveType: z.enum(['SICK', 'CASUAL', 'ANNUAL', 'MATERNITY', 'OTHER']),
  startDate: date,
  endDate: date,
  reason: z.string().trim().min(5).max(1000),
}).refine((data) => data.startDate <= data.endDate, { path: ['endDate'], message: 'End date must be on or after start date' });

export const reviewLeaveSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
export const leaveParamsSchema = z.object({ id: z.string().uuid() });
