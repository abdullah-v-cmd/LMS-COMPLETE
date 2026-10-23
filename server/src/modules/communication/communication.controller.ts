import { Response, NextFunction } from 'express';
import { CommunicationService } from './communication.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class CommunicationController {
  static async getRecipients(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await CommunicationService.getRecipients(req.institutionId!, req.user!)); } catch (error) { next(error); }
  }

  static async getAnnouncements(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const announcements = await CommunicationService.getAnnouncements(req.institutionId!, req.user!);
      return sendSuccess(res, announcements);
    } catch (error) {
      next(error);
    }
  }

  static async createAnnouncement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const announcement = await CommunicationService.createAnnouncement(
        req.institutionId!,
        req.user!.id,
        req.body
      );
      return sendSuccess(res, announcement, 201);
    } catch (error) {
      next(error);
    }
  }

  static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const message = await CommunicationService.sendMessage(
        req.institutionId!,
        req.user!.id,
        req.body
      );
      return sendSuccess(res, message, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getMyMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const messages = await CommunicationService.getMyMessages(req.institutionId!, req.user!.id);
      return sendSuccess(res, messages);
    } catch (error) {
      next(error);
    }
  }

  static async getMyNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const notifications = await CommunicationService.getMyNotifications(req.institutionId!, req.user!.id);
      return sendSuccess(res, notifications);
    } catch (error) {
      next(error);
    }
  }

  static async markNotificationRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await CommunicationService.markNotificationRead(req.params.id, req.institutionId!, req.user!.id);
      return sendSuccess(res, { message: 'Notification marked as read' });
    } catch (error) {
      next(error);
    }
  }
}
