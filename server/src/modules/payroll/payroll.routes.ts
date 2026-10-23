import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { PayrollController } from './payroll.controller';
import { compensationSchema, payrollPeriodSchema } from './payroll.schemas';

const router = Router();
router.use(requireAuth, requireTenant);
router.get('/staff', requirePermission(PERMISSIONS.PAYROLL_READ), PayrollController.staff);
router.post('/compensations', requirePermission(PERMISSIONS.PAYROLL_MANAGE), validateRequest({ body: compensationSchema }), logAuditEvent('PAYROLL_COMPENSATION_SET', 'StaffCompensation'), PayrollController.saveCompensation);
router.get('/runs', requirePermission(PERMISSIONS.PAYROLL_READ), PayrollController.runs);
router.post('/runs', requirePermission(PERMISSIONS.PAYROLL_MANAGE), validateRequest({ body: payrollPeriodSchema }), logAuditEvent('PAYROLL_SUMMARY_GENERATED', 'PayrollRun'), PayrollController.generate);
export default router;
