import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendSuccess } from '../../utils/response';
import { LibraryService } from './library.service';
import { prisma } from '../../utils/prisma';

export class LibraryController {
  static async finePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.getFinePolicy(req.institutionId!)); } catch (e) { next(e); } }
  static async saveFinePolicy(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.saveFinePolicy(req.institutionId!, req.user!.id, req.body)); } catch (e) { next(e); } }
  static async books(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.listBooks(req.institutionId!)); } catch (e) { next(e); } }
  static async createBook(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.createBook(req.institutionId!, req.body), 201); } catch (e) { next(e); } }
  static async barcode(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.findCopyByBarcode(req.institutionId!, req.params.barcode)); } catch (e) { next(e); } }
  static async reservations(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { const profile = await prisma.studentProfile.findFirst({ where: { userId: req.user!.id, institutionId: req.institutionId! }, select: { id: true } }); return sendSuccess(res, await LibraryService.reservations(req.institutionId!, req.user!.role === 'ROLE_STUDENT' ? profile?.id : undefined)); } catch (e) { next(e); } }
  static async createReservation(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { const profile = await prisma.studentProfile.findFirst({ where: { userId: req.user!.id, institutionId: req.institutionId!, status: 'ENROLLED' }, select: { id: true } }); if (!profile) throw { status: 403, message: 'An enrolled student profile is required' }; return sendSuccess(res, await LibraryService.createReservation(req.institutionId!, profile.id, req.body.bookId), 201); } catch (e) { next(e); } }
  static async cancelReservation(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { const profile = req.user!.role === 'ROLE_STUDENT' ? await prisma.studentProfile.findFirst({ where: { userId: req.user!.id, institutionId: req.institutionId! }, select: { id: true } }) : null; return sendSuccess(res, await LibraryService.cancelReservation(req.institutionId!, req.params.id, profile?.id)); } catch (e) { next(e); } }
  static async reportLost(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.reportLost(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
  static async recoverLost(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.recoverLost(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
  static async inventoryAudits(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.inventoryAudits(req.institutionId!)); } catch (e) { next(e); } }
  static async createInventoryAudit(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.createInventoryAudit(req.institutionId!, req.user!.id, req.body.bookId, req.body.barcodes), 201); } catch (e) { next(e); } }
  static async loans(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.listLoans(req.institutionId!, req.user!.id, req.user!.role)); } catch (e) { next(e); } }
  static async checkout(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.checkout(req.institutionId!, req.user!.id, req.body), 201); } catch (e) { next(e); } }
  static async checkin(req: AuthenticatedRequest, res: Response, next: NextFunction) { try { return sendSuccess(res, await LibraryService.checkin(req.institutionId!, req.params.id)); } catch (e) { next(e); } }
}
