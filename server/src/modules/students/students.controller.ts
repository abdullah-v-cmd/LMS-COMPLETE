import { Response, NextFunction } from 'express';
import { StudentsService } from './students.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class StudentsController {
  static async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sectionId = req.query.sectionId as string | undefined;
      const students = await StudentsService.getAll(req.institutionId!, sectionId);
      return sendSuccess(res, students);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const student = await StudentsService.getById(req.params.id, req.institutionId!);
      return sendSuccess(res, student);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const student = await StudentsService.create(req.institutionId!, req.body);
      return sendSuccess(res, student, 201);
    } catch (error) {
      next(error);
    }
  }

  static async linkParent(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const relation = await StudentsService.linkParent(req.params.id, req.body, req.institutionId!);
      return sendSuccess(res, relation, 201);
    } catch (error) {
      next(error);
    }
  }
}
