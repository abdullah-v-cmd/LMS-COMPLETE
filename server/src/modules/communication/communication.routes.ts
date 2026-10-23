import { Router } from 'express';
import { CommunicationController } from './communication.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { requirePermission } from '../../middleware/rbac';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import { createAnnouncementSchema, sendMessageSchema, notificationIdSchema } from './communication.schemas';
import { PERMISSIONS } from '../../constants/permissions';

const router = Router();

router.use(requireAuth);
router.use(requireTenant);

router.get('/announcements', CommunicationController.getAnnouncements);

router.post(
  '/announcements',
  requirePermission(PERMISSIONS.COMMUNICATION_ANNOUNCE),
  validateRequest({ body: createAnnouncementSchema }),
  logAuditEvent('ANNOUNCEMENT_CREATED', 'Announcement'),
  CommunicationController.createAnnouncement
);

router.get('/messages', CommunicationController.getMyMessages);
router.get('/recipients', requirePermission(PERMISSIONS.COMMUNICATION_MESSAGE), CommunicationController.getRecipients);

router.post(
  '/messages',
  requirePermission(PERMISSIONS.COMMUNICATION_MESSAGE),
  validateRequest({ body: sendMessageSchema }),
  CommunicationController.sendMessage
);

router.get('/notifications', CommunicationController.getMyNotifications);
router.patch('/notifications/:id/read', validateRequest({ params: notificationIdSchema }), CommunicationController.markNotificationRead);

export default router;
