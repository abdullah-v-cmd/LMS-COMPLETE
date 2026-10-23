import { Response, NextFunction } from 'express';
import { AcademicService } from './academic.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class AcademicController {
  static async getAcademicYears(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const years = await AcademicService.getAcademicYears(req.institutionId!);
      return sendSuccess(res, years);
    } catch (error) {
      next(error);
    }
  }

  static async createAcademicYear(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const year = await AcademicService.createAcademicYear(req.institutionId!, req.body);
      return sendSuccess(res, year, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getClassGrades(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const classes = await AcademicService.getClassGrades(req.institutionId!);
      return sendSuccess(res, classes);
    } catch (error) {
      next(error);
    }
  }

  static async createClassGrade(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const classGrade = await AcademicService.createClassGrade(req.institutionId!, req.body);
      return sendSuccess(res, classGrade, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createSection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const section = await AcademicService.createSection(req.body);
      return sendSuccess(res, section, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getSubjects(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const subjects = await AcademicService.getSubjects(req.institutionId!);
      return sendSuccess(res, subjects);
    } catch (error) {
      next(error);
    }
  }

  static async createSubject(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const subject = await AcademicService.createSubject(req.institutionId!, req.body);
      return sendSuccess(res, subject, 201);
    } catch (error) {
      next(error);
    }
  }

  static async assignTeacher(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const assignment = await AcademicService.assignTeacher(req.body);
      return sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }
}
