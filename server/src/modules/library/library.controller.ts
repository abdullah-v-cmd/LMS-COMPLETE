import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { LibraryService } from './library.service';

export class LibraryController {
  static async finePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.getFinePolicy(req.institutionId!)); } catch (e) { next(e); } }
  static async saveFinePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.saveFinePolicy(req.institutionId!, req.user!.id, req.body)); } catch (e) { next(e); } }
  static async books(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.listBooks(req.institutionId!)); } catch (e) { next(e); } }
  static async createBook(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.createBook(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async barcode(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.findCopyByBarcode(req.institutionId!, req.params.barcode)); } catch (e) { next(e); } }
  static async loans(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.listLoans(req.institutionId!, req.user!.id, req.user!.role)); } catch (e) { next(e); } }
  static async checkout(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.checkout(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async checkin(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.checkin(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
}
