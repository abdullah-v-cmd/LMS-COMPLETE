import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { LeaveService } from './leave.service';

export class LeaveController {
  static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await LeaveService.list(req.institutionId!, req.user!.id, req.user!.role)); } catch (error) { next(error); }
  }
  static async request(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await LeaveService.request(req.institutionId!, req.user!.id, req.body), 201); } catch (error) { next(error); }
  }
  static async review(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await LeaveService.review(req.institutionId!, req.params.id, req.user!.id, req.body.status)); } catch (error) { next(error); }
  }
}
