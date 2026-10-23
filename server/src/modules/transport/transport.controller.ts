import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { TransportService } from './transport.service';

export class TransportController {
  static async routes(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.routes(req.institutionId!)); } catch (e) { next(e); } }
  static async allocations(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.allocations(req.institutionId!)); } catch (e) { next(e); } }
  static async createRoute(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createRoute(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async createVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createVehicle(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async allocate(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.allocate(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
}
