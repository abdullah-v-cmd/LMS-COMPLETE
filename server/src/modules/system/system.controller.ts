import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { SystemService } from './system.service';
import { sendSuccess, sendError } from '../../utils/response';
import { UserRole } from '@prisma/client';

export class SystemController {
  /**
   * GET /api/v1/system/backup
   * Downloads a full JSON snapshot of the database
   */
  static async downloadBackup(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ROLE_SUPER_ADMIN && userRole !== UserRole.ROLE_INSTITUTION_ADMIN) {
        return sendError(res, 403, 'FORBIDDEN', 'Only authorized administrators can generate and download database backups.');
      }

      const backup = await SystemService.generateBackup(req.institutionId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `lms_database_backup_${timestamp}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(backup, null, 2));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/system/recycle-bin
   * Returns items currently in the recycle bin
   */
  static async getRecycleBin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const items = await SystemService.getRecycleBin(req.institutionId!);
      return sendSuccess(res, items);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/system/recycle-bin/delete
   * Moves a student or course to the recycle bin
   */
  static async moveToRecycleBin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ROLE_SUPER_ADMIN && userRole !== UserRole.ROLE_INSTITUTION_ADMIN) {
        return sendError(res, 403, 'FORBIDDEN', 'Only authorized administrators can delete records to the recycle bin.');
      }

      const { entityType, entityId, reason } = req.body;
      if (!entityType || !entityId) {
        return sendError(res, 400, 'BAD_REQUEST', 'entityType and entityId are required.');
      }

      const deletedBy = `${req.user?.username || req.user?.email || 'Admin'} (${req.user?.role || ''})`;
      const result = await SystemService.moveToRecycleBin(req.institutionId!, {
        entityType,
        entityId,
        deletedBy,
        reason,
      });

      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/system/recycle-bin/:id/restore
   * Restores an item from the recycle bin back to active status
   */
  static async restoreItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ROLE_SUPER_ADMIN && userRole !== UserRole.ROLE_INSTITUTION_ADMIN) {
        return sendError(res, 403, 'FORBIDDEN', 'Only authorized administrators can restore records.');
      }

      const result = await SystemService.restoreItem(req.institutionId!, req.params.id);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/system/recycle-bin/:id
   * Permanently deletes an item from the database
   */
  static async permanentDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ROLE_SUPER_ADMIN && userRole !== UserRole.ROLE_INSTITUTION_ADMIN) {
        return sendError(res, 403, 'FORBIDDEN', 'Only authorized administrators can permanently delete records.');
      }

      const result = await SystemService.permanentDelete(req.institutionId!, req.params.id);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
}
