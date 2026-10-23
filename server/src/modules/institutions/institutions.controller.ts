import { Response, NextFunction } from 'express';
import { InstitutionsService } from './institutions.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class InstitutionsController {
  static async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const institutions = await InstitutionsService.getAll(req.user!);
      return sendSuccess(res, institutions);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const institution = await InstitutionsService.getById(req.params.id, req.user!);
      return sendSuccess(res, institution);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const institution = await InstitutionsService.create(req.body);
      return sendSuccess(res, institution, 201);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const institution = await InstitutionsService.update(req.params.id, req.body, req.user!);
      return sendSuccess(res, institution);
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const institution = await InstitutionsService.updateStatus(req.params.id, status, req.user!);
      return sendSuccess(res, institution);
    } catch (error) {
      next(error);
    }
  }
}
