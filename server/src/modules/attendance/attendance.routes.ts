import { Router } from 'express';
import { AttendanceController } from './attendance.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import {
  markAttendanceSchema,
  requestCorrectionSchema,
  absenceJustificationSchema,
  reviewCorrectionSchema,
  getAttendanceSchema,
  attendanceRosterParamsSchema,
  attendanceRosterQuerySchema,
  subjectRosterQuerySchema,
  markSubjectAttendanceSchema,
  attendanceSummaryQuerySchema,
  reviewCorrectionParamsSchema,
} from './attendance.schemas';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/', requirePermission(PERMISSIONS.ATTENDANCE_READ), validateRequest({ query: getAttendanceSchema }), AttendanceController.getAttendance);
router.get('/subjects', requirePermission(PERMISSIONS.ATTENDANCE_READ), validateRequest({ query: getAttendanceSchema }), AttendanceController.getSubjectAttendance);
router.get('/reports/summary', requirePermission(PERMISSIONS.ATTENDANCE_READ), validateRequest({ query: attendanceSummaryQuerySchema }), AttendanceController.getAttendanceSummary);
router.get('/sections', requirePermission(PERMISSIONS.ATTENDANCE_MARK), AttendanceController.getSections);
router.get('/sections/:sectionId/roster', requirePermission(PERMISSIONS.ATTENDANCE_MARK), validateRequest({ params: attendanceRosterParamsSchema, query: attendanceRosterQuerySchema }), AttendanceController.getSectionRoster);
router.get('/subject-assignments', requirePermission(PERMISSIONS.ATTENDANCE_MARK), AttendanceController.getSubjectAssignments);
router.get('/sections/:sectionId/subject-roster', requirePermission(PERMISSIONS.ATTENDANCE_MARK), validateRequest({ params: attendanceRosterParamsSchema, query: subjectRosterQuerySchema }), AttendanceController.getSubjectRoster);
router.get('/corrections', requirePermission(PERMISSIONS.ATTENDANCE_APPROVE), AttendanceController.getCorrectionQueue);

router.post(
  '/mark',
  requirePermission(PERMISSIONS.ATTENDANCE_MARK),
  validateRequest({ body: markAttendanceSchema }),
  logAuditEvent('ATTENDANCE_MARKED', 'AttendanceRecord'),
  AttendanceController.markAttendance
);

router.post('/subjects/mark', requirePermission(PERMISSIONS.ATTENDANCE_MARK), validateRequest({ body: markSubjectAttendanceSchema }), logAuditEvent('SUBJECT_ATTENDANCE_MARKED', 'SubjectAttendanceRecord'), AttendanceController.markSubjectAttendance);

router.post(
  '/justifications',
  requirePermission(PERMISSIONS.ATTENDANCE_JUSTIFY),
  validateRequest({ body: absenceJustificationSchema }),
  logAuditEvent('ATTENDANCE_ABSENCE_JUSTIFICATION_REQUESTED', 'AttendanceCorrection'),
  AttendanceController.requestAbsenceJustification
);

router.post(
  '/corrections',
  requirePermission(PERMISSIONS.ATTENDANCE_UPDATE),
  validateRequest({ body: requestCorrectionSchema }),
  logAuditEvent('ATTENDANCE_CORRECTION_REQUESTED', 'AttendanceCorrection'),
  AttendanceController.requestCorrection
);

router.post(
  '/corrections/:id/review',
  requirePermission(PERMISSIONS.ATTENDANCE_APPROVE),
  validateRequest({ params: reviewCorrectionParamsSchema, body: reviewCorrectionSchema }),
  logAuditEvent('ATTENDANCE_CORRECTION_REVIEWED', 'AttendanceCorrection'),
  AttendanceController.reviewCorrection
);

export default router;
