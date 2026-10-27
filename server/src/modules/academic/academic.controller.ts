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

  static async getSections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sections = await AcademicService.getSections(
        req.institutionId!,
        req.query.classGradeId as string | undefined
      );
      return sendSuccess(res, sections);
    } catch (error) {
      next(error);
    }
  }

  static async createSection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const section = await AcademicService.createSection(req.institutionId!, req.body);
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
      const assignment = await AcademicService.assignTeacher(req.institutionId!, req.body);
      return sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getTeachers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const teachers = await AcademicService.getTeachers(req.institutionId!);
      return sendSuccess(res, teachers);
    } catch (error) {
      next(error);
    }
  }

  static async getTeacherAssignments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const teacherId = typeof req.query.teacherId === 'string' ? req.query.teacherId : undefined;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
      const assignments = await AcademicService.getTeacherAssignments(req.institutionId!, { teacherId, userId });
      return sendSuccess(res, assignments);
    } catch (error) {
      next(error);
    }
  }

  static async unassignTeacher(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await AcademicService.unassignTeacher(req.institutionId!, req.params.id);
      return sendSuccess(res, { message: 'Teacher assignment removed successfully' });
    } catch (error) {
      next(error);
    }
  }
}
