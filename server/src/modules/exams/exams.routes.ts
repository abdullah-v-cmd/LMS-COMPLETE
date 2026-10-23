import { Router } from 'express';
import { ExamsController } from './exams.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import {
  createExamSessionSchema,
  createExamScheduleSchema,
  enterMarksSchema,
  requestGradeChangeSchema,
  reviewGradeChangeSchema,
  publishResultsSchema,
  reportCardsQuerySchema,
  reviewGradeChangeParamsSchema,
  assignInvigilatorsSchema,
  gradingScaleSchema,
  reportCardVerificationQuerySchema,
} from './exams.schemas';

const router = Router();
router.use(requireAuth, requireTenant);

router.get('/sessions', requirePermission(PERMISSIONS.EXAM_READ), ExamsController.getExamSessions);
router.get('/grading-scale', requirePermission(PERMISSIONS.EXAM_READ), ExamsController.getGradingScale);
router.put('/grading-scale', requirePermission(PERMISSIONS.EXAM_CREATE), validateRequest({ body: gradingScaleSchema }), logAuditEvent('EXAM_GRADING_SCALE_UPDATED', 'InstitutionGradeBand'), ExamsController.setGradingScale);
router.get('/invigilators/candidates', requirePermission(PERMISSIONS.EXAM_READ), ExamsController.getInvigilatorCandidates);
router.get('/schedules/:id/invigilators', requirePermission(PERMISSIONS.EXAM_READ), validateRequest({ params: reviewGradeChangeParamsSchema }), ExamsController.getScheduleInvigilators);
router.put('/schedules/:id/invigilators', requirePermission(PERMISSIONS.EXAM_CREATE), validateRequest({ params: reviewGradeChangeParamsSchema, body: assignInvigilatorsSchema }), logAuditEvent('EXAM_INVIGILATORS_ASSIGNED', 'ExamSchedule'), ExamsController.assignInvigilators);
router.get('/schedules/:id/roster', requirePermission(PERMISSIONS.EXAM_MARKS_ENTRY), validateRequest({ params: reviewGradeChangeParamsSchema }), ExamsController.getMarksRoster);
router.get('/grade-changes', requirePermission(PERMISSIONS.GRADE_APPROVE), ExamsController.getPendingGradeChanges);
router.post('/sessions', requirePermission(PERMISSIONS.EXAM_CREATE), validateRequest({ body: createExamSessionSchema }), logAuditEvent('EXAM_SESSION_CREATED', 'ExamSession'), ExamsController.createExamSession);
router.post('/schedules', requirePermission(PERMISSIONS.EXAM_CREATE), validateRequest({ body: createExamScheduleSchema }), logAuditEvent('EXAM_SCHEDULE_CREATED', 'ExamSchedule'), ExamsController.createExamSchedule);
router.post('/marks', requirePermission(PERMISSIONS.EXAM_MARKS_ENTRY), validateRequest({ body: enterMarksSchema }), logAuditEvent('EXAM_MARKS_ENTERED', 'ExamMark'), ExamsController.enterMarks);
router.post('/grade-changes', requirePermission(PERMISSIONS.GRADE_UPDATE), validateRequest({ body: requestGradeChangeSchema }), logAuditEvent('GRADE_CHANGE_REQUESTED', 'GradeChangeRequest'), ExamsController.requestGradeChange);
router.post('/grade-changes/:id/review', requirePermission(PERMISSIONS.GRADE_APPROVE), validateRequest({ params: reviewGradeChangeParamsSchema, body: reviewGradeChangeSchema }), logAuditEvent('GRADE_CHANGE_REVIEWED', 'GradeChangeRequest'), ExamsController.reviewGradeChange);
router.post('/results/publish', requirePermission(PERMISSIONS.RESULT_RELEASE), validateRequest({ body: publishResultsSchema }), logAuditEvent('EXAM_RESULTS_PUBLISHED', 'ExamSession'), ExamsController.publishResults);
router.get('/report-cards', requirePermission(PERMISSIONS.EXAM_READ), validateRequest({ query: reportCardsQuerySchema }), ExamsController.getReportCards);
router.get('/report-cards/:id/verify', requirePermission(PERMISSIONS.EXAM_READ), validateRequest({ params: reviewGradeChangeParamsSchema, query: reportCardVerificationQuerySchema }), ExamsController.verifyReportCard);

export default router;
