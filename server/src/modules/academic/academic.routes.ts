import { Router } from 'express';
import { AcademicController } from './academic.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import {
  createAcademicYearSchema,
  createClassGradeSchema,
  createSectionSchema,
  createSubjectSchema,
  assignTeacherSchema,
} from './academic.schemas';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/years', AcademicController.getAcademicYears);
router.post(
  '/years',
  requirePermission(PERMISSIONS.ACADEMIC_MANAGE),
  validateRequest({ body: createAcademicYearSchema }),
  logAuditEvent('ACADEMIC_YEAR_CREATED', 'AcademicYear'),
  AcademicController.createAcademicYear
);

router.get('/classes', AcademicController.getClassGrades);
router.post(
  '/classes',
  requirePermission(PERMISSIONS.ACADEMIC_MANAGE),
  validateRequest({ body: createClassGradeSchema }),
  logAuditEvent('CLASS_GRADE_CREATED', 'ClassGrade'),
  AcademicController.createClassGrade
);

router.post(
  '/sections',
  requirePermission(PERMISSIONS.ACADEMIC_MANAGE),
  validateRequest({ body: createSectionSchema }),
  logAuditEvent('SECTION_CREATED', 'Section'),
  AcademicController.createSection
);

router.get('/subjects', AcademicController.getSubjects);
router.post(
  '/subjects',
  requirePermission(PERMISSIONS.ACADEMIC_MANAGE),
  validateRequest({ body: createSubjectSchema }),
  logAuditEvent('SUBJECT_CREATED', 'Subject'),
  AcademicController.createSubject
);

router.post(
  '/assign-teacher',
  requirePermission(PERMISSIONS.ACADEMIC_MANAGE),
  validateRequest({ body: assignTeacherSchema }),
  logAuditEvent('TEACHER_ASSIGNED', 'TeacherAssignment'),
  AcademicController.assignTeacher
);

export default router;
