import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { sendSuccess, sendError } from '../../utils/response';
import { AnalyticsService } from './analytics.service';
import { UserRole } from '@prisma/client';

const router = Router();

// All analytics endpoints require auth + tenant scope
router.use(requireAuth, requireTenant);

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// GET /api/v1/analytics/dashboard — role-specific dashboard stats
router.get('/dashboard', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const data = await AnalyticsService.dashboardStats(institutionId, user);
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/attendance — attendance summary with optional filters
router.get('/attendance', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const { from, to, sectionId } = req.query as Record<string, string | undefined>;
  const data = await AnalyticsService.attendanceSummary(institutionId, user, { from, to, sectionId });
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/exams — exam session results summary
router.get('/exams', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const { sessionId, academicYearId } = req.query as Record<string, string | undefined>;
  const data = await AnalyticsService.examResultsSummary(institutionId, user, { sessionId, academicYearId });
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/finance — financial summary (finance roles only)
router.get('/finance', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const { from, to } = req.query as Record<string, string | undefined>;
  const data = await AnalyticsService.financeSummary(institutionId, user, { from, to });
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/lms — LMS course analytics
router.get('/lms', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const { courseId } = req.query as Record<string, string | undefined>;
  const data = await AnalyticsService.lmsSummary(institutionId, user, { courseId });
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/transport — transport attendance and billing summary
router.get('/transport', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const { from, to, routeId } = req.query as Record<string, string | undefined>;
  const data = await AnalyticsService.transportSummary(institutionId, user, { from, to, routeId });
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/library — library inventory and circulation summary
router.get('/library', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const data = await AnalyticsService.librarySummary(institutionId, user);
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/hostel — hostel occupancy and billing summary
router.get('/hostel', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const data = await AnalyticsService.hostelSummary(institutionId, user);
  return sendSuccess(res, data);
}));

// GET /api/v1/analytics/hr — staff/HR summary
router.get('/hr', wrap(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const institutionId = (req as any).institutionId;
  const data = await AnalyticsService.hrSummary(institutionId, user);
  return sendSuccess(res, data);
}));

export default router;
