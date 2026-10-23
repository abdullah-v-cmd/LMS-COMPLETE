import { z } from 'zod';

export const referralSchema = z.object({ studentId: z.string().uuid(), reason: z.string().trim().min(5).max(1000) }).strict();
export const createCaseSchema = z.object({ studentId: z.string().uuid(), caseTitle: z.string().trim().min(3).max(160), riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW') }).strict();
export const noteSchema = z.object({ sessionDate: z.string().datetime().optional(), notes: z.string().trim().min(1).max(10000), actionPlan: z.string().trim().max(3000).optional() }).strict();
export const supportPlanSchema = z.object({ caseId: z.string().uuid(), title: z.string().trim().min(3).max(160), goal: z.string().trim().min(3).max(1500), actions: z.string().trim().min(3).max(3000), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() }).strict().refine((data) => !data.startsAt || !data.endsAt || new Date(data.endsAt) >= new Date(data.startsAt), { path: ['endsAt'], message: 'Plan end must be on or after its start' });
export const followUpSchema = z.object({ supportPlanId: z.string().uuid(), dueAt: z.string().datetime(), notes: z.string().trim().max(5000).optional() }).strict();
export const atRiskRuleSchema = z.object({ name: z.string().trim().min(3).max(100), minimumAbsences: z.number().int().min(1).max(100), lookbackDays: z.number().int().min(1).max(365), minimumGradePercent: z.number().min(0).max(100).nullable().optional(), isActive: z.boolean().default(true) }).strict();
export const reviewReferralSchema = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).strict();
export const idParamsSchema = z.object({ id: z.string().uuid() });
