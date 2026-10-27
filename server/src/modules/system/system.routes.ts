import { Router } from 'express';
import { SystemController } from './system.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/backup', SystemController.downloadBackup);
router.get('/recycle-bin', SystemController.getRecycleBin);
router.post('/recycle-bin/delete', SystemController.moveToRecycleBin);
router.post('/recycle-bin/:id/restore', SystemController.restoreItem);
router.delete('/recycle-bin/:id', SystemController.permanentDelete);

export const systemRoutes = router;
