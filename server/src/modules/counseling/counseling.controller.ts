import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { CounselingService } from './counseling.service';

export class CounselingController {
  static async referrals(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.referrals(req.user!, req.institutionId!)); } catch (e) { next(e); } }
  static async referralCandidates(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.referralCandidates(req.user!, req.institutionId!)); } catch (e) { next(e); } }
  static async submitReferral(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.submitReferral(req.user!, req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async reviewReferral(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.reviewReferral(req.user!, req.institutionId!, req.params.id, req.body.status)); } catch (e) { next(e); } }
  static async cases(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.cases(req.user!, req.institutionId!)); } catch (e) { next(e); } }
  static async createCase(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.createCase(req.user!, req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async notes(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.notes(req.user!, req.institutionId!, req.params.id)); } catch (e) { next(e); } }
  static async addNote(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.addNote(req.user!, req.institutionId!, req.params.id, req.body), 201); } catch (e) { next(e); } }
  static async createPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.createSupportPlan(req.user!, req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async addFollowUp(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.addFollowUp(req.user!, req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async completeFollowUp(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.completeFollowUp(req.user!, req.institutionId!, req.params.id, req.body.notes)); } catch (e) { next(e); } }
  static async rules(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.rules(req.user!, req.institutionId!)); } catch (e) { next(e); } }
  static async saveRule(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.saveRule(req.user!, req.institutionId!, req.body)); } catch (e) { next(e); } }
  static async atRisk(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await CounselingService.atRiskStudents(req.user!, req.institutionId!)); } catch (e) { next(e); } }
}
