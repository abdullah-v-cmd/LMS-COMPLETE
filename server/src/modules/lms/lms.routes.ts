import { Router } from 'express';
import { LmsController } from './lms.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import {
  createCourseSchema,
  createModuleSchema,
  createLessonSchema,
  createAssignmentSchema,
  submitAssignmentSchema,
  gradeSubmissionSchema,
} from './lms.schemas';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

// Stream or download assignment PDF submission (supports ?token= query param for browser tab/iframe preview)
router.get('/submissions/:id/attachment', LmsController.getSubmissionAttachment);

router.use(requireAuth);
router.use(requireTenant);

router.get('/courses', requirePermission(PERMISSIONS.COURSE_READ), LmsController.getCourses);
router.get('/courses/:id', requirePermission(PERMISSIONS.COURSE_READ), LmsController.getCourseById);

router.post(
  '/courses',
  requirePermission(PERMISSIONS.COURSE_CREATE),
  validateRequest({ body: createCourseSchema }),
  logAuditEvent('COURSE_CREATED', 'Course'),
  LmsController.createCourse
);

router.post(
  '/modules',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateRequest({ body: createModuleSchema }),
  logAuditEvent('MODULE_CREATED', 'CourseModule'),
  LmsController.createModule
);

router.post(
  '/lessons',
  requirePermission(PERMISSIONS.COURSE_UPDATE),
  validateRequest({ body: createLessonSchema }),
  logAuditEvent('LESSON_CREATED', 'Lesson'),
  LmsController.createLesson
);

router.post(
  '/assignments',
  requirePermission(PERMISSIONS.ASSIGNMENT_CREATE),
  validateRequest({ body: createAssignmentSchema }),
  logAuditEvent('ASSIGNMENT_CREATED', 'Assignment'),
  LmsController.createAssignment
);

router.get(
  '/assignments/:id/submissions',
  requirePermission(PERMISSIONS.ASSIGNMENT_GRADE),
  LmsController.getSubmissions
);

router.post(
  '/assignments/:id/submit',
  requirePermission(PERMISSIONS.ASSIGNMENT_SUBMIT),
  validateRequest({ body: submitAssignmentSchema }),
  logAuditEvent('ASSIGNMENT_SUBMITTED', 'AssignmentSubmission'),
  LmsController.submitAssignment
);

router.post(
  '/submissions/:id/grade',
  requirePermission(PERMISSIONS.ASSIGNMENT_GRADE),
  validateRequest({ body: gradeSubmissionSchema }),
  logAuditEvent('SUBMISSION_GRADED', 'AssignmentSubmission'),
  LmsController.gradeSubmission
);

export default router;
