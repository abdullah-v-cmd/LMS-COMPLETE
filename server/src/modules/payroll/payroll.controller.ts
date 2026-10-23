import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { PayrollService } from './payroll.service';

export class PayrollController {
  static async staff(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await PayrollService.staff(req.user!, req.institutionId!)); } catch (error) { next(error); } }
  static async saveCompensation(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await PayrollService.saveCompensation(req.user!, req.institutionId!, req.body), 201); } catch (error) { next(error); } }
  static async runs(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await PayrollService.runs(req.user!, req.institutionId!)); } catch (error) { next(error); } }
  static async generate(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await PayrollService.generate(req.user!, req.institutionId!, req.body.period), 201); } catch (error) { next(error); } }
}
