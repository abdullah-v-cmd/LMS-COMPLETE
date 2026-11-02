import { Router } from 'express';
import { AssessmentController } from './assessment.controller';
import { requireAuth } from '../../middleware/auth';
import { requireTenant } from '../../middleware/tenant';
import { validateRequest } from '../../middleware/validate';
import { logAuditEvent } from '../../middleware/audit';
import {
  createAssessmentSchemeSchema,
  updateAssessmentSchemeSchema,
  createAssessmentItemSchema,
  extendAssessmentDeadlineSchema,
  saveMarksBatchSchema,
  submitAssignmentWorkSchema,
  gradeAssignmentSubmissionSchema,
  submitSubjectResultSchema,
  requestResultCorrectionSchema,
  reviewResultCorrectionSchema,
  examDepartmentReviewSchema,
  saveGradebookMarksSchema,
} from './assessment.schemas';

const router = Router();
router.use(requireAuth, requireTenant);

// Unified Gradebook
router.get('/gradebook', AssessmentController.getGradebook);
router.post(
  '/gradebook/save',
  validateRequest({ body: saveGradebookMarksSchema }),
  logAuditEvent('GRADEBOOK_MARKS_SAVED', 'StudentAssessmentMark'),
  AssessmentController.saveGradebookMarks
);

// Teacher assignment subjects & sections
router.get('/teacher/assignments', AssessmentController.getTeacherAssignments);

// Schemes
router.get('/schemes', AssessmentController.getAssessmentScheme);
router.post(
  '/schemes',
  validateRequest({ body: createAssessmentSchemeSchema }),
  logAuditEvent('ASSESSMENT_SCHEME_CREATED', 'AssessmentScheme'),
  AssessmentController.createAssessmentScheme
);
router.put(
  '/schemes/:id',
  validateRequest({ body: updateAssessmentSchemeSchema }),
  logAuditEvent('ASSESSMENT_SCHEME_UPDATED', 'AssessmentScheme'),
  AssessmentController.updateAssessmentScheme
);

// Assessment Items & Assignments
router.post(
  '/items',
  validateRequest({ body: createAssessmentItemSchema }),
  logAuditEvent('ASSESSMENT_ITEM_CREATED', 'AssessmentItem'),
  AssessmentController.createAssessmentItem
);
router.post(
  '/items/:id/extend-deadline',
  validateRequest({ body: extendAssessmentDeadlineSchema }),
  logAuditEvent('ASSESSMENT_DEADLINE_EXTENDED', 'AssessmentItem'),
  AssessmentController.extendAssessmentDeadline
);
router.get('/items/:id/roster', AssessmentController.getAssessmentMarksRoster);

// Marks Batch Entry
router.post(
  '/marks/batch',
  validateRequest({ body: saveMarksBatchSchema }),
  logAuditEvent('ASSESSMENT_MARKS_SAVED', 'StudentAssessmentMark'),
  AssessmentController.saveMarksBatch
);

// Student Assignment Submission
router.post(
  '/items/:id/submit-work',
  validateRequest({ body: submitAssignmentWorkSchema }),
  logAuditEvent('ASSIGNMENT_WORK_SUBMITTED', 'AssessmentSubmissionRecord'),
  AssessmentController.submitAssignmentWork
);

// Teacher Grading
router.post(
  '/submissions/:id/grade',
  validateRequest({ body: gradeAssignmentSubmissionSchema }),
  logAuditEvent('ASSIGNMENT_SUBMISSION_GRADED', 'AssessmentSubmissionRecord'),
  AssessmentController.gradeAssignmentSubmission
);

// Section Subject Results
router.get('/section-results', AssessmentController.getSectionSubjectResults);

// BUTTON A: Submit (Publish to Students)
router.post(
  '/results/submit-to-students',
  validateRequest({ body: submitSubjectResultSchema }),
  logAuditEvent('SUBJECT_RESULTS_SUBMITTED_TO_STUDENTS', 'SubjectResult'),
  AssessmentController.submitToStudents
);

// BUTTON B: Submit to Exam Department
router.post(
  '/results/submit-to-exam-dept',
  validateRequest({ body: submitSubjectResultSchema }),
  logAuditEvent('SUBJECT_RESULTS_SUBMITTED_TO_EXAM_DEPT', 'SubjectResult'),
  AssessmentController.submitToExamDepartment
);

// Teacher Correction Request
router.post(
  '/results/request-correction',
  validateRequest({ body: requestResultCorrectionSchema }),
  logAuditEvent('RESULT_CORRECTION_REQUESTED', 'SubjectResultCorrectionRequest'),
  AssessmentController.requestResultCorrection
);
router.post(
  '/corrections/request',
  validateRequest({ body: requestResultCorrectionSchema }),
  logAuditEvent('RESULT_CORRECTION_REQUESTED', 'SubjectResultCorrectionRequest'),
  AssessmentController.requestResultCorrection
);

// Exam Department Dashboard & Reviews
router.get('/exam-dept/dashboard', AssessmentController.getExamDepartmentDashboard);
router.post(
  '/exam-dept/review',
  validateRequest({ body: examDepartmentReviewSchema }),
  logAuditEvent('EXAM_DEPT_RESULT_REVIEWED', 'SubjectResult'),
  AssessmentController.reviewSectionResultByExamDept
);
router.post(
  '/exam-dept/publish',
  logAuditEvent('EXAM_DEPT_RESULT_PUBLISHED', 'SubjectResult'),
  AssessmentController.publishSectionResultByExamDept
);
router.post(
  '/exam-dept/corrections/:id/review',
  validateRequest({ body: reviewResultCorrectionSchema }),
  logAuditEvent('RESULT_CORRECTION_REVIEWED', 'SubjectResultCorrectionRequest'),
  AssessmentController.reviewCorrectionRequest
);

// Student / Parent Portal View
router.get('/student-result', AssessmentController.getStudentSubjectResult);

export default router;
