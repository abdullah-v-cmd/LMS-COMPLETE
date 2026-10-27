import { Router } from 'express';
import { StudentsController } from './students.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { createStudentSchema, linkParentSchema, changeSectionSchema } from './students.schemas';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/', requirePermission(PERMISSIONS.STUDENT_READ), StudentsController.getAll);

router.get('/:id', requirePermission(PERMISSIONS.STUDENT_READ), StudentsController.getById);

router.post(
  '/',
  requirePermission(PERMISSIONS.STUDENT_CREATE),
  validateRequest({ body: createStudentSchema }),
  logAuditEvent('STUDENT_CREATED', 'StudentProfile'),
  StudentsController.create
);

router.patch(
  '/:id/section',
  requirePermission(PERMISSIONS.STUDENT_UPDATE),
  validateRequest({ body: changeSectionSchema }),
  logAuditEvent('STUDENT_SECTION_CHANGED', 'StudentProfile'),
  StudentsController.changeSection
);

router.post(
  '/:id/parents',
  requirePermission(PERMISSIONS.STUDENT_UPDATE),
  validateRequest({ body: linkParentSchema }),
  logAuditEvent('PARENT_LINKED', 'StudentParentRelation'),
  StudentsController.linkParent
);

router.delete(
  '/:id/parents/:parentId',
  requirePermission(PERMISSIONS.STUDENT_UPDATE),
  logAuditEvent('PARENT_UNLINKED', 'StudentParentRelation'),
  StudentsController.unlinkParent
);

export default router;
