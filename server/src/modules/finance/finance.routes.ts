import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { FinanceController } from './finance.controller';
import { feeStructureSchema, generateInvoicesSchema, recordPaymentSchema, waiverRequestSchema, waiverReviewSchema, waiverIdSchema, refundRequestSchema } from './finance.schemas';

const router = Router();
router.use(requireAuth, requireTenant);

router.get('/structures', requirePermission(PERMISSIONS.FEE_READ), FinanceController.getFeeStructures);
router.post('/structures', requirePermission(PERMISSIONS.FEE_STRUCTURE_MANAGE), validateRequest({ body: feeStructureSchema }), logAuditEvent('FEE_STRUCTURE_CREATED', 'FeeStructure'), FinanceController.createFeeStructure);
router.post('/invoices/generate', requirePermission(PERMISSIONS.FEE_STRUCTURE_MANAGE), validateRequest({ body: generateInvoicesSchema }), logAuditEvent('FEE_INVOICES_GENERATED', 'StudentFeeInvoice'), FinanceController.generateInvoices);
router.get('/invoices', requirePermission(PERMISSIONS.FEE_READ), FinanceController.getInvoices);
router.get('/waivers', requireAnyPermission(PERMISSIONS.FEE_WAIVER_REQUEST, PERMISSIONS.FEE_WAIVER_APPROVE), FinanceController.getWaivers);
router.get('/refunds', requireAnyPermission(PERMISSIONS.FEE_REFUND_REQUEST, PERMISSIONS.FEE_REFUND_APPROVE), FinanceController.getRefunds);
router.post('/payments', requirePermission(PERMISSIONS.FEE_COLLECT), validateRequest({ body: recordPaymentSchema }), logAuditEvent('FEE_PAYMENT_RECORDED', 'FeePayment'), FinanceController.recordPayment);
router.post('/waivers', requirePermission(PERMISSIONS.FEE_WAIVER_REQUEST), validateRequest({ body: waiverRequestSchema }), logAuditEvent('FEE_WAIVER_REQUESTED', 'FeeWaiverRequest'), FinanceController.requestWaiver);
router.post('/waivers/:id/review', requirePermission(PERMISSIONS.FEE_WAIVER_APPROVE), validateRequest({ params: waiverIdSchema, body: waiverReviewSchema }), logAuditEvent('FEE_WAIVER_REVIEWED', 'FeeWaiverRequest'), FinanceController.reviewWaiver);
router.post('/refunds', requirePermission(PERMISSIONS.FEE_REFUND_REQUEST), validateRequest({ body: refundRequestSchema }), logAuditEvent('FEE_REFUND_REQUESTED', 'FeeRefundRequest'), FinanceController.requestRefund);
router.post('/refunds/:id/review', requirePermission(PERMISSIONS.FEE_REFUND_APPROVE), validateRequest({ params: waiverIdSchema, body: waiverReviewSchema }), logAuditEvent('FEE_REFUND_REVIEWED', 'FeeRefundRequest'), FinanceController.reviewRefund);
router.get('/ledger', requirePermission(PERMISSIONS.LEDGER_READ), FinanceController.getLedger);

export default router;
