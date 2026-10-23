import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { LeaveController } from './leave.controller';
import { createLeaveSchema, leaveParamsSchema, reviewLeaveSchema } from './leave.schemas';

const router = Router();
router.use(requireAuth, requireTenant);
router.get('/requests', requirePermission(PERMISSIONS.LEAVE_REQUEST), LeaveController.list);
router.post('/requests', requirePermission(PERMISSIONS.LEAVE_REQUEST), validateRequest({ body: createLeaveSchema }), logAuditEvent('STAFF_LEAVE_REQUESTED', 'StaffLeaveRequest'), LeaveController.request);
router.post('/requests/:id/review', requirePermission(PERMISSIONS.LEAVE_APPROVE), validateRequest({ params: leaveParamsSchema, body: reviewLeaveSchema }), logAuditEvent('STAFF_LEAVE_REVIEWED', 'StaffLeaveRequest'), LeaveController.review);
export default router;
