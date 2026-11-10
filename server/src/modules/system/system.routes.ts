import { Router } from 'express';
import { SystemController } from './system.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requireRoles } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);
router.use(requireRoles([UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN]));

router.get('/backup', SystemController.downloadBackup);
router.get('/recycle-bin', SystemController.getRecycleBin);
router.post('/recycle-bin/delete', SystemController.moveToRecycleBin);
router.post('/recycle-bin/:id/restore', SystemController.restoreItem);
router.delete('/recycle-bin/:id', SystemController.permanentDelete);

export const systemRoutes = router;
