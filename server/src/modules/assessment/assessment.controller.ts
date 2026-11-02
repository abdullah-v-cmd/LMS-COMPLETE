import { Response, NextFunction } from 'express';
import { AssessmentService } from './assessment.service';
import { sendSuccess } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class AssessmentController {
  static async getTeacherAssignments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const assignments = await AssessmentService.getTeacherAssignments(req.institutionId!, req.user!);
      return sendSuccess(res, assignments);
    } catch (error) {
      next(error);
    }
  }

  static async getAssessmentScheme(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { subjectId, academicTermId, sectionId } = req.query as {
        subjectId: string;
        academicTermId: string;
        sectionId?: string;
      };
      const scheme = await AssessmentService.getAssessmentScheme(
        req.institutionId!,
        req.user!,
        subjectId,
        academicTermId,
        sectionId
      );
      return sendSuccess(res, scheme);
    } catch (error) {
      next(error);
    }
  }

  static async createAssessmentScheme(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const scheme = await AssessmentService.createAssessmentScheme(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, scheme, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateAssessmentScheme(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const scheme = await AssessmentService.updateAssessmentScheme(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body
      );
      return sendSuccess(res, scheme);
    } catch (error) {
      next(error);
    }
  }

  static async createAssessmentItem(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const item = await AssessmentService.createAssessmentItem(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, item, 201);
    } catch (error) {
      next(error);
    }
  }

  static async extendAssessmentDeadline(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const updated = await AssessmentService.extendAssessmentDeadline(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body
      );
      return sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  }

  static async getAssessmentMarksRoster(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sectionId } = req.query as { sectionId: string };
      const roster = await AssessmentService.getAssessmentMarksRoster(
        req.institutionId!,
        req.user!,
        req.params.id,
        sectionId
      );
      return sendSuccess(res, roster);
    } catch (error) {
      next(error);
    }
  }

  static async saveMarksBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const saved = await AssessmentService.saveMarksBatch(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, saved);
    } catch (error) {
      next(error);
    }
  }

  static async submitAssignmentWork(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const submission = await AssessmentService.submitAssignmentWork(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body
      );
      return sendSuccess(res, submission, 201);
    } catch (error) {
      next(error);
    }
  }

  static async gradeAssignmentSubmission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const graded = await AssessmentService.gradeAssignmentSubmission(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body
      );
      return sendSuccess(res, graded);
    } catch (error) {
      next(error);
    }
  }

  static async getSectionSubjectResults(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { subjectId, sectionId, academicTermId } = req.query as {
        subjectId: string;
        sectionId: string;
        academicTermId: string;
      };
      const results = await AssessmentService.getSectionSubjectResults(
        req.institutionId!,
        req.user!,
        subjectId,
        sectionId,
        academicTermId
      );
      return sendSuccess(res, results);
    } catch (error) {
      next(error);
    }
  }

  /**
   * BUTTON A: Submit (Publish to Students)
   */
  static async submitToStudents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.submitToStudents(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * BUTTON B: Submit to Exam Department
   */
  static async submitToExamDepartment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.submitToExamDepartment(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async requestResultCorrection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const correction = await AssessmentService.requestResultCorrection(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, correction, 201);
    } catch (error) {
      next(error);
    }
  }

  static async getExamDepartmentDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { academicTermId } = req.query as { academicTermId?: string };
      const dashboard = await AssessmentService.getExamDepartmentDashboard(
        req.institutionId!,
        req.user!,
        academicTermId
      );
      return sendSuccess(res, dashboard);
    } catch (error) {
      next(error);
    }
  }

  static async reviewSectionResultByExamDept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.reviewSectionResultByExamDept(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async publishSectionResultByExamDept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.publishSectionResultByExamDept(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async reviewCorrectionRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.reviewCorrectionRequest(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async getStudentSubjectResult(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { subjectId, academicTermId, studentId } = req.query as {
        subjectId: string;
        academicTermId: string;
        studentId?: string;
      };
      const result = await AssessmentService.getStudentSubjectResult(
        req.institutionId!,
        req.user!,
        subjectId,
        academicTermId,
        studentId
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async getGradebook(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { subjectId, sectionId, academicTermId } = req.query as {
        subjectId: string;
        sectionId: string;
        academicTermId: string;
      };
      const gradebook = await AssessmentService.getGradebook(
        req.institutionId!,
        req.user!,
        subjectId,
        sectionId,
        academicTermId
      );
      return sendSuccess(res, gradebook);
    } catch (error) {
      next(error);
    }
  }

  static async saveGradebookMarks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const gradebook = await AssessmentService.saveGradebookMarks(
        req.institutionId!,
        req.user!,
        req.body
      );
      return sendSuccess(res, gradebook);
    } catch (error) {
      next(error);
    }
  }

  static async getExamSchedules(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { subjectId, academicTermId } = req.query as { subjectId: string; academicTermId: string };
      const schedules = await AssessmentService.getExamSchedulesForSubject(
        req.institutionId!,
        subjectId,
        academicTermId
      );
      return sendSuccess(res, schedules);
    } catch (error) {
      next(error);
    }
  }

  static async connectExamSchedule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.connectExamSchedule(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body.examScheduleId || null,
        req.body.syncNow !== false
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async syncExamScheduleMarks(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.syncExamScheduleMarks(
        req.institutionId!,
        req.user!,
        req.params.id
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async uploadManualMarksCsv(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await AssessmentService.uploadManualMarksCsv(
        req.institutionId!,
        req.user!,
        req.params.id,
        req.body.rows
      );
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
}


