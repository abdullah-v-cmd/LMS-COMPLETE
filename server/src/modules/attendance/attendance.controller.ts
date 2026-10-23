import { Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import { attendanceSummaryQuerySchema } from './attendance.schemas';

export class AttendanceController {
  static async getSections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await AttendanceService.getSections(req.institutionId!, req.user!)); } catch (error) { next(error); }
  }

  static async getSectionRoster(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await AttendanceService.getSectionRoster(req.institutionId!, req.user!, req.params.sectionId, String(req.query.date)));
    } catch (error) { next(error); }
  }

  static async getSubjectAssignments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await AttendanceService.getSubjectAssignments(req.institutionId!, req.user!)); } catch (error) { next(error); }
  }

  static async getSubjectRoster(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      return sendSuccess(res, await AttendanceService.getSubjectRoster(req.institutionId!, req.user!, req.params.sectionId, String(req.query.subjectId), String(req.query.date), Number(req.query.periodNumber)));
    } catch (error) { next(error); }
  }

  static async getCorrectionQueue(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await AttendanceService.getCorrectionQueue(req.institutionId!, req.user!)); } catch (error) { next(error); }
  }

  static async markAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const records = await AttendanceService.markAttendance(
        req.institutionId!,
        req.user!.id,
        req.body
      );
      return sendSuccess(res, records, 201);
    } catch (error) {
      next(error);
    }
  }

  static async markSubjectAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await AttendanceService.markSubjectAttendance(req.institutionId!, req.user!.id, req.body), 201); } catch (error) { next(error); }
  }

  static async getAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const records = await AttendanceService.getAttendance(req.institutionId!, req.user!, req.query);
      return sendSuccess(res, records);
    } catch (error) {
      next(error);
    }
  }

  static async getSubjectAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const records = await AttendanceService.getSubjectAttendance(req.institutionId!, req.user!, req.query);
      return sendSuccess(res, records);
    } catch (error) { next(error); }
  }

  static async getAttendanceSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const query = attendanceSummaryQuerySchema.parse(req.query);
      return sendSuccess(res, await AttendanceService.getAttendanceSummary(req.institutionId!, req.user!, { ...query, thresholdPercent: query.thresholdPercent ?? 10, minimumSchoolDays: query.minimumSchoolDays ?? 10 }));
    } catch (error) { next(error); }
  }

  static async requestCorrection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const correction = await AttendanceService.requestCorrection(req.institutionId!, req.user!.id, req.body);
      return sendSuccess(res, correction, 201);
    } catch (error) {
      next(error);
    }
  }

  static async requestAbsenceJustification(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const justification = await AttendanceService.requestAbsenceJustification(req.institutionId!, req.user!.id, req.body);
      return sendSuccess(res, justification, 201);
    } catch (error) { next(error); }
  }

  static async reviewCorrection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const reviewed = await AttendanceService.reviewCorrection(
        req.institutionId!,
        req.params.id,
        req.user!.id,
        req.body
      );
      return sendSuccess(res, reviewed, 200);
    } catch (error) {
      next(error);
    }
  }
}
