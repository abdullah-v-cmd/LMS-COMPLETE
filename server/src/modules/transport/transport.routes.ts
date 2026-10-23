import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { TransportController } from './transport.controller';
import { allocationSchema, routeSchema, vehicleSchema } from './transport.schemas';

const router = Router();
router.use(requireAuth, requireTenant);
router.get('/routes', requirePermission(PERMISSIONS.TRANSPORT_READ), TransportController.routes);
router.get('/allocations', requirePermission(PERMISSIONS.TRANSPORT_READ), TransportController.allocations);
router.post('/routes', requirePermission(PERMISSIONS.TRANSPORT_MANAGE), validateRequest({ body: routeSchema }), logAuditEvent('TRANSPORT_ROUTE_CREATED', 'TransportRoute'), TransportController.createRoute);
router.post('/vehicles', requirePermission(PERMISSIONS.TRANSPORT_MANAGE), validateRequest({ body: vehicleSchema }), logAuditEvent('TRANSPORT_VEHICLE_CREATED', 'TransportVehicle'), TransportController.createVehicle);
router.post('/allocations', requirePermission(PERMISSIONS.TRANSPORT_MANAGE), validateRequest({ body: allocationSchema }), logAuditEvent('TRANSPORT_STUDENT_ALLOCATED', 'StudentTransportAllocation'), TransportController.allocate);
export default router;
