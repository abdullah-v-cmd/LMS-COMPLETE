import { z } from 'zod';

export const blockSchema = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(['BOYS', 'GIRLS', 'MIXED']), totalRooms: z.number().int().min(1).max(500) }).strict();
export const roomSchema = z.object({ blockId: z.string().uuid(), roomNumber: z.string().trim().min(1).max(20), capacity: z.number().int().min(1).max(20) }).strict();
export const allocationSchema = z.object({ roomId: z.string().uuid(), studentId: z.string().uuid(), bedNumber: z.number().int().min(1).max(20) }).strict();
export const gatePassSchema = z.object({ reason: z.string().trim().min(5).max(500), destination: z.string().trim().min(2).max(160), expectedReturnAt: z.string().datetime() }).strict();
export const visitorSchema = z.object({ studentId: z.string().uuid().optional(), visitorName: z.string().trim().min(2).max(120), purpose: z.string().trim().min(3).max(300) }).strict();
export const messChargeSchema = z.object({ studentId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amount: z.number().positive().max(10000000) }).strict();
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const gatePassReviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

export const incidentSchema = z.object({ studentId: z.string().uuid().optional(), category: z.enum(['SAFETY', 'PROPERTY', 'DISCIPLINE', 'HEALTH', 'OTHER']), description: z.string().trim().min(5).max(2000), occurredAt: z.string().datetime() }).strict();

export const checkInSchema = z.object({ studentId: z.string().uuid() }).strict();
