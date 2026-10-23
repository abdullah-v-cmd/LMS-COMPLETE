import { Response, NextFunction } from 'express';
import { ExamsService } from './exams.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class ExamsController {
  static async getExamSessions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const sessions = await ExamsService.getExamSessions(req.institutionId!);
      return sendSuccess(res, sessions);
    } catch (error) {
      next(error);
    }
  }

  static async createExamSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const session = await ExamsService.createExamSession(req.institutionId!, req.body);
      return sendSuccess(res, session, 201);
    } catch (error) {
      next(error);
    }
  }

  static async createExamSchedule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const schedule = await ExamsService.createExamSchedule(req.institutionId!, req.body);
      return sendSuccess(res, schedule, 201);
    } catch (error) {
      next(error);
    }
  }

  static async enterMarks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const marks = await ExamsService.enterMarks(req.institutionId!, req.user!, req.body);
      return sendSuccess(res, marks, 200);
    } catch (error) {
      next(error);
    }
  }

  static async requestGradeChange(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const changeReq = await ExamsService.requestGradeChange(req.institutionId!, req.user!, req.body);
      return sendSuccess(res, changeReq, 201);
    } catch (error) {
      next(error);
    }
  }

  static async reviewGradeChange(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const reviewed = await ExamsService.reviewGradeChange(req.institutionId!, req.params.id, req.user!.id, req.body);
      return sendSuccess(res, reviewed, 200);
    } catch (error) {
      next(error);
    }
  }

  static async publishResults(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await ExamsService.publishResults(req.institutionId!, req.body.examSessionId);
      return sendSuccess(res, result, 200);
    } catch (error) {
      next(error);
    }
  }

  static async getReportCards(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const studentId = req.query.studentId as string | undefined;
      const reportCards = await ExamsService.getReportCards(req.institutionId!, req.user!, studentId);
      return sendSuccess(res, reportCards);
    } catch (error) {
      next(error);
    }
  }
}
