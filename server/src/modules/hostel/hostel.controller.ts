import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { HostelService } from './hostel.service';

export class HostelController {
  static async blocks(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.blocks(req.institutionId!)); } catch (e) { next(e); } }
  static async createBlock(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.createBlock(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async createRoom(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.createRoom(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async allocations(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.allocations(req.institutionId!)); } catch (e) { next(e); } }
  static async allocate(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.allocate(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async requestGatePass(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.requestGatePass(req.user!, req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async myGatePasses(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.myGatePasses(req.user!, req.institutionId!)); } catch (e) { next(e); } }
  static async gatePasses(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.gatePasses(req.institutionId!)); } catch (e) { next(e); } }
  static async reviewGatePass(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.reviewGatePass(req.institutionId!, req.params.id, req.user!.id, req.body.status)); } catch (e) { next(e); } }
  static async markDeparted(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.markGatePass(req.institutionId!, req.params.id, 'depart')); } catch (e) { next(e); } }
  static async markReturned(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.markGatePass(req.institutionId!, req.params.id, 'return')); } catch (e) { next(e); } }
  static async visitors(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.visitors(req.institutionId!)); } catch (e) { next(e); } }
  static async logVisitor(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.logVisitor(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async closeVisitor(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.closeVisitor(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
  static async messCharges(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.messCharges(req.institutionId!)); } catch (e) { next(e); } }
  static async createMessCharge(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.createMessCharge(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async markMessChargePaid(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await HostelService.markMessChargePaid(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
}
