import { Response, NextFunction } from 'express';
import { LmsService } from './lms.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class LmsController {
  static async getCourses(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const courses = await LmsService.getCourses(req.institutionId!, req.user!);
      return sendSuccess(res, courses);
    } catch (error) {
      next(error);
    }
  }

  static async getCourseById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const course = await LmsService.getCourseById(req.params.id, req.institutionId!);
      return sendSuccess(res, course);
    } catch (error) {
      next(error);
    }
  }

  static async createCourse(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const course = await LmsService.createCourse(req.institutionId!, req.body);
      return sendSuccess(res, course, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createModule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const module = await LmsService.createModule(req.body);
      return sendSuccess(res, module, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createLesson(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const lesson = await LmsService.createLesson(req.body);
      return sendSuccess(res, lesson, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const assignment = await LmsService.createAssignment(req.body);
      return sendSuccess(res, assignment, 201);
    } catch (error) {
      next(error);
    }
  }

  static async submitAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const submission = await LmsService.submitAssignment(req.params.id, req.user!, req.body);
      return sendSuccess(res, submission, 200);
    } catch (error) {
      next(error);
    }
  }

  static async gradeSubmission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const graded = await LmsService.gradeSubmission(req.params.id, req.user!.id, req.body);
      return sendSuccess(res, graded, 200);
    } catch (error) {
      next(error);
    }
  }
}
