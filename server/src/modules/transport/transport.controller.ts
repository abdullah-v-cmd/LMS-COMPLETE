import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { TransportService } from './transport.service';

export class TransportController {
  static async routes(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.routes(req.institutionId!, req.user!.role)); } catch (e) { next(e); } }
  static async allocations(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.allocations(req.institutionId!, req.user!)); } catch (e) { next(e); } }
  static async createRoute(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createRoute(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async createVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createVehicle(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async allocate(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.allocate(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async createStop(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createStop(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async createVehicleDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createVehicleDocument(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async assignDriver(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.assignDriver(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async trackingLogs(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.trackingLogs(req.institutionId!, req.user!)); } catch (e) { next(e); } }
  static async recordTrackingLog(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.recordTrackingLog(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async incidents(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.incidents(req.institutionId!, req.user!)); } catch (e) { next(e); } }
  static async createIncident(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.createIncident(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async attendance(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.attendance(req.institutionId!, req.user!)); } catch (e) { next(e); } }
  static async markAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.markAttendance(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async generateMonthlyCharge(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await TransportService.generateMonthlyCharge(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
}
