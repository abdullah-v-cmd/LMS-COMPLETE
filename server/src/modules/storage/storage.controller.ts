import { Request, Response, NextFunction } from 'express';
import { StorageService, StorageFolder, SENSITIVE_FOLDERS } from '../../utils/storage';
import { StorageAuthService } from './storage-auth.service';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';
import { UserRole } from '@prisma/client';

export class StorageController {
  /**
   * Uploads a file (multipart or base64 JSON) with role verification and magic-byte signature validation.
   */
  static async upload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication is required to upload files.');
      }

      let buffer: Buffer | null = null;
      let filename = 'file.bin';
      let mimeType = 'application/octet-stream';
      const folder: StorageFolder = (req.body.folder as StorageFolder) || 'general';

      // Role check for folder uploads:
      // 1. Counseling folder
      if (folder === 'counseling') {
        const allowedRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_COUNSELOR];
        if (!allowedRoles.includes(req.user.role as UserRole)) {
          return sendError(res, 403, 'FORBIDDEN', 'Uploads to counseling are restricted to counselors and administrators.');
        }
      }
      // 2. Exams folder
      if (folder === 'exams') {
        const forbiddenRoles: UserRole[] = [UserRole.ROLE_STUDENT, UserRole.ROLE_PARENT];
        if (forbiddenRoles.includes(req.user.role as UserRole)) {
          return sendError(res, 403, 'FORBIDDEN', 'Students and parents cannot upload examination materials.');
        }
      }
      // 3. Teachers HR folder
      if (folder === 'teachers') {
        const forbiddenRoles: UserRole[] = [UserRole.ROLE_STUDENT, UserRole.ROLE_PARENT];
        if (forbiddenRoles.includes(req.user.role as UserRole)) {
          return sendError(res, 403, 'FORBIDDEN', 'Uploads to teacher records are restricted.');
        }
      }

      // 1. Multipart file upload via multer
      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname;
        mimeType = req.file.mimetype;
      }
      // 2. Base64 payload upload
      else if (req.body.dataUrl) {
        const dataUrl = req.body.dataUrl as string;
        filename = req.body.filename || 'upload.pdf';
        if (dataUrl.startsWith('data:')) {
          const parts = dataUrl.split(';base64,');
          mimeType = parts[0].replace('data:', '') || 'application/octet-stream';
          buffer = Buffer.from(parts[1] || '', 'base64');
        } else {
          buffer = Buffer.from(dataUrl, 'base64');
          mimeType = req.body.mimeType || 'application/octet-stream';
        }
      }

      if (!buffer || buffer.length === 0) {
        return sendError(res, 400, 'NO_FILE_PROVIDED', 'Please provide a file to upload.');
      }

      // Validate file extension and magic-byte file signature
      StorageService.validateFileType(filename);
      StorageService.validateFileSignature(buffer, filename, mimeType);

      const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
      const stored = await StorageService.uploadFile(buffer, filename, mimeType, { folder, isPublic });

      return sendSuccess(res, stored, 201);
    } catch (error: any) {
      if (error.status && error.message) {
        return sendError(res, error.status, 'INVALID_FILE', error.message);
      }
      next(error);
    }
  }

  /**
   * Serves or streams a stored file with database relationship-level authorization for sensitive assets.
   */
  static async getFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const keyOrUrl =
        (req.query.key as string) ||
        (req.query.url as string) ||
        (req.params.folder && req.params.filename ? `${req.params.folder}/${req.params.filename}` : req.path);

      if (!keyOrUrl) {
        return sendError(res, 400, 'MISSING_FILE_KEY', 'File key or URL is required.');
      }

      // Extract folder name to determine sensitivity
      let cleanKey = keyOrUrl;
      if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
        try {
          cleanKey = new URL(cleanKey).pathname;
        } catch {
          // fallback
        }
      }
      const sanitized = cleanKey.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
      const parts = sanitized.split('/').filter(Boolean);
      const folder = (req.params.folder || parts[0] || '').toLowerCase();

      if (SENSITIVE_FOLDERS.has(folder)) {
        if (!req.user) {
          return sendError(
            res,
            401,
            'UNAUTHORIZED',
            'Authentication is required to access sensitive institutional documents.'
          );
        }

        // Evaluate database-level authorization via StorageAuthService
        const authCheck = await StorageAuthService.canAccessFile(req.user, keyOrUrl);
        if (!authCheck.authorized) {
          return sendError(
            res,
            403,
            'FORBIDDEN',
            authCheck.reason || 'You do not have authorization to view this document.'
          );
        }
      }

      const file = await StorageService.getFile(keyOrUrl);
      if (!file) {
        return sendError(res, 404, 'FILE_NOT_FOUND', 'Requested file was not found.');
      }

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (SENSITIVE_FOLDERS.has(folder)) {
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }

      return res.send(file.buffer);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Deletes a file with strict resource-level authorization checks.
   */
  static async deleteFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication is required to delete files.');
      }

      const keyOrUrl =
        (req.body.key as string) ||
        (req.body.url as string) ||
        (req.query.key as string);

      if (!keyOrUrl) {
        return sendError(res, 400, 'MISSING_FILE_KEY', 'File key or URL is required for deletion.');
      }

      // Resource-level authorization check for file deletion
      const authCheck = await StorageAuthService.canDeleteFile(req.user, keyOrUrl);
      if (!authCheck.authorized) {
        return sendError(
          res,
          403,
          'FORBIDDEN',
          authCheck.reason || 'You do not have permission to delete this file.'
        );
      }

      const deleted = await StorageService.deleteFile(keyOrUrl);
      return sendSuccess(res, { deleted, keyOrUrl });
    } catch (error: any) {
      next(error);
    }
  }
}
