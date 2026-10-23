import { Router } from 'express';
import { InstitutionsController } from './institutions.controller';
import { requireAuth } from '../../middleware/auth';
import { requireRoles, requirePermission } from '../../middleware/rbac';
import { requireTenant } from '../../middleware/tenant';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { createInstitutionSchema, updateInstitutionSchema } from './institutions.schemas';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

router.use(requireAuth);

router.get('/', InstitutionsController.getAll);

router.get('/:id', requireTenant, InstitutionsController.getById);

router.post(
  '/',
  requireRoles([UserRole.ROLE_SUPER_ADMIN]),
  validateRequest({ body: createInstitutionSchema }),
  logAuditEvent('INSTITUTION_CREATED', 'Institution'),
  InstitutionsController.create
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INSTITUTION_UPDATE),
  requireTenant,
  validateRequest({ body: updateInstitutionSchema }),
  logAuditEvent('INSTITUTION_UPDATED', 'Institution'),
  InstitutionsController.update
);

router.patch(
  '/:id/status',
  requireRoles([UserRole.ROLE_SUPER_ADMIN]),
  logAuditEvent('INSTITUTION_STATUS_CHANGED', 'Institution'),
  InstitutionsController.updateStatus
);

export default router;
