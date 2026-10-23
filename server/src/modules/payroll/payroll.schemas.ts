import { z } from 'zod';

export const compensationSchema = z.object({
  teacherProfileId: z.string().uuid(),
  monthlySalary: z.number().positive().max(100000000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const payrollPeriodSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();
