import { Request, Response, NextFunction } from 'express';
import { StorageService, StorageFolder } from '../../utils/storage';
import { sendSuccess, sendError } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class StorageController {
  /**
   * Uploads a file (multipart or base64 JSON).
   */
  static async upload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      let buffer: Buffer | null = null;
      let filename = 'file.bin';
      let mimeType = 'application/octet-stream';
      const folder: StorageFolder = (req.body.folder as StorageFolder) || 'general';

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

      const stored = await StorageService.uploadFile(buffer, filename, mimeType, { folder });

      return sendSuccess(res, stored, 201);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Serves or redirects to a stored file.
   */
  static async getFile(req: Request, res: Response, next: NextFunction) {
    try {
      const keyOrUrl = (req.query.key as string) || (req.query.url as string) || req.path;
      if (!keyOrUrl) {
        return sendError(res, 400, 'MISSING_FILE_KEY', 'File key or URL is required.');
      }

      const file = await StorageService.getFile(keyOrUrl);
      if (!file) {
        return sendError(res, 404, 'FILE_NOT_FOUND', 'Requested file was not found.');
      }

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(file.buffer);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Deletes a file.
   */
  static async deleteFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const keyOrUrl = (req.body.key as string) || (req.body.url as string) || (req.query.key as string);
      if (!keyOrUrl) {
        return sendError(res, 400, 'MISSING_FILE_KEY', 'File key or URL is required for deletion.');
      }

      const deleted = await StorageService.deleteFile(keyOrUrl);
      return sendSuccess(res, { deleted, keyOrUrl });
    } catch (error: any) {
      next(error);
    }
  }
}

