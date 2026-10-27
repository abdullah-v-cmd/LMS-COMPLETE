import { Router } from 'express';
import { UsersController } from './users.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requireRoles, requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { UserRole } from '@prisma/client';
import { PERMISSIONS } from '../../constants/permissions';
import { createUserSchema, updateUserRoleSchema, resetPasswordSchema } from './users.schemas';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  UsersController.listUsers
);

router.post(
  '/',
  requireRoles([UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN]),
  requirePermission(PERMISSIONS.USER_CREATE),
  validateRequest({ body: createUserSchema }),
  logAuditEvent('USER_CREATED', 'User'),
  UsersController.createUser
);

router.put(
  '/:id/role',
  requireRoles([UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN]),
  requirePermission(PERMISSIONS.USER_UPDATE),
  validateRequest({ body: updateUserRoleSchema }),
  logAuditEvent('USER_ROLE_UPDATED', 'User'),
  UsersController.updateUserRole
);

router.post(
  '/:id/reset-password',
  requireRoles([UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN]),
  validateRequest({ body: resetPasswordSchema }),
  logAuditEvent('USER_PASSWORD_RESET_ADMIN', 'User'),
  UsersController.resetUserPassword
);

export default router;
