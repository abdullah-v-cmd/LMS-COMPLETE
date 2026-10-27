import { Response, NextFunction } from 'express';
import { UsersService } from './users.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class UsersController {
  static async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const users = await UsersService.listUsers(
        req.institutionId!,
        req.user!,
        {
          search: req.query.search as string | undefined,
          role: req.query.role as string | undefined,
        }
      );
      return sendSuccess(res, users);
    } catch (error) {
      next(error);
    }
  }

  static async createUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const user = await UsersService.createUser(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, user, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateUserRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await UsersService.updateUserRole(
        req.params.id,
        req.user!,
        req.body
      );
      return sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  }

  static async resetUserPassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { newPassword } = req.body;
      const result = await UsersService.resetUserPassword(
        req.params.id,
        req.user!,
        newPassword
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
}
