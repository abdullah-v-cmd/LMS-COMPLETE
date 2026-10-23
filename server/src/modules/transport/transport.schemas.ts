import { z } from 'zod';

export const routeSchema = z.object({ name: z.string().trim().min(2).max(120), startPoint: z.string().trim().min(1).max(160), endPoint: z.string().trim().min(1).max(160), monthlyFee: z.number().finite().min(0).max(999999999).refine((n) => Math.round(n * 100) === n * 100, 'Amount must have at most two decimal places') });
export const vehicleSchema = z.object({ routeId: z.string().uuid(), vehicleNumber: z.string().trim().min(1).max(40), driverName: z.string().trim().min(2).max(120), driverPhone: z.string().trim().min(5).max(32), capacity: z.number().int().min(1).max(200) });
export const allocationSchema = z.object({ routeId: z.string().uuid(), studentId: z.string().uuid(), pickupStop: z.string().trim().min(1).max(160) });
