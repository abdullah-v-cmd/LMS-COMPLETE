import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { FinanceService } from './finance.service';

export class FinanceController {
  static async getFeeStructures(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.getFeeStructures(req.institutionId!)); } catch (error) { next(error); }
  }
  static async createFeeStructure(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.createFeeStructure(req.institutionId!, req.body), 201); } catch (error) { next(error); }
  }
  static async generateInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.generateInvoices(req.institutionId!, req.user!.id, req.body.feeStructureId), 201); } catch (error) { next(error); }
  }
  static async getInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.getInvoices(req.institutionId!, req.user!)); } catch (error) { next(error); }
  }
  static async recordPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.recordPayment(req.institutionId!, req.user!.id, req.body), 201); } catch (error) { next(error); }
  }
  static async requestWaiver(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.requestWaiver(req.institutionId!, req.user!.id, req.body), 201); } catch (error) { next(error); }
  }
  static async reviewWaiver(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.reviewWaiver(req.institutionId!, req.params.id, req.user!.id, req.body.status), 200); } catch (error) { next(error); }
  }
  static async getLedger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.getLedger(req.institutionId!)); } catch (error) { next(error); }
  }
  static async getWaivers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.getWaivers(req.institutionId!)); } catch (error) { next(error); }
  }
  static async getRefunds(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.getRefunds(req.institutionId!)); } catch (error) { next(error); }
  }
  static async requestRefund(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.requestRefund(req.institutionId!, req.user!.id, req.body), 201); } catch (error) { next(error); }
  }
  static async reviewRefund(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await FinanceService.reviewRefund(req.institutionId!, req.params.id, req.user!.id, req.body.status)); } catch (error) { next(error); }
  }
}
