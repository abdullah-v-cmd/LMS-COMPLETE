import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { put, del, head } from '@vercel/blob';
import { env } from '../config/env';
import { logger } from './logger';

export interface StoredFile {
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export type StorageFolder =
  | 'students'
  | 'teachers'
  | 'courses'
  | 'assignments'
  | 'submissions'
  | 'exams'
  | 'avatars'
  | 'general';

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.py',
  '.pl',
  '.cgi',
  '.jar',
  '.vbs',
  '.ps1',
]);

export class StorageService {
  private static uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR || './uploads');

  private static ensureLocalUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      try {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      } catch (err: any) {
        logger.warn(`Could not create local upload directory: ${err.message}`);
      }
    }
  }

  /**
   * Sanitizes a filename to prevent directory traversal and remove problematic characters.
   */
  public static sanitizeFilename(rawFilename: string): string {
    const basename = path.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    return basename.slice(0, 100);
  }

  /**
   * Validates file extension against prohibited executable types.
   */
  public static validateFileType(filename: string): void {
    const ext = path.extname(filename).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw {
        status: 400,
        message: `File type '${ext}' is not permitted for security reasons.`,
      };
    }
  }

  /**
   * Uploads a file buffer to persistent storage (Vercel Blob, S3, or Local fallback).
   * In production, Vercel Blob is enforced and silent fallback to local/memory is strictly rejected.
   */
  public static async uploadFile(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    options: { folder?: StorageFolder | string } = {}
  ): Promise<StoredFile> {
    const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw {
        status: 400,
        message: `File size exceeds the allowed limit of ${env.MAX_FILE_SIZE_MB}MB.`,
      };
    }

    this.validateFileType(originalFilename);

    const safeName = this.sanitizeFilename(originalFilename);
    const uniquePrefix = crypto.randomUUID();
    const folder = options.folder ? options.folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'general';
    const storageKey = `${folder}/${uniquePrefix}-${safeName}`;

    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const currentToken = process.env.BLOB_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;
    const isProduction = (process.env.NODE_ENV || env.NODE_ENV) === 'production';

    // Provider: Vercel Blob (Production standard)
    if (currentProvider === 'VERCEL_BLOB') {
      if (!currentToken) {
        throw new Error(
          'BLOB_READ_WRITE_TOKEN is missing. Vercel Blob storage requires a valid read/write token.'
        );
      }

      try {
        const blob = await put(storageKey, buffer, {
          access: 'public',
          token: currentToken,
          contentType: mimeType,
        });

        logger.info(`File uploaded to Vercel Blob: ${blob.url} (${buffer.length} bytes)`);

        // Sensitive documents are routed through the authenticated LMS gateway
        const isSensitive = [
          'students',
          'teachers',
          'courses',
          'assignments',
          'submissions',
          'exams',
          'counseling',
        ].includes(folder);
        const resolvedUrl = isSensitive ? `/api/v1/storage/${storageKey}` : blob.url;

        return {
          key: storageKey,
          url: resolvedUrl,
          filename: safeName,
          mimeType,
          size: buffer.length,
        };
      } catch (err: any) {
        logger.error(`Vercel Blob upload failed: ${err.message}`);
        // In production, NEVER fall back to local disk or memory - fail loudly to protect data integrity
        if (isProduction) {
          throw new Error(
            `Vercel Blob upload failed: ${err.message}. Silent fallback to local storage or memory is strictly prohibited in production to prevent data loss.`
          );
        }
        // In development/test, continue to local disk fallback
      }
    }

    // Provider: Local disk storage (Development & Test only)
    this.ensureLocalUploadDir();
    const targetFolder = path.join(this.uploadDir, folder);
    if (!fs.existsSync(targetFolder)) {
      try {
        fs.mkdirSync(targetFolder, { recursive: true });
      } catch (err: any) {
        this.uploadDir = '/tmp/uploads';
      }
    }

    const filePath = path.join(this.uploadDir, storageKey);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/api/v1/storage/${storageKey}`;
    return {
      key: storageKey,
      url: publicUrl,
      filename: safeName,
      mimeType,
      size: buffer.length,
    };
  }

  /**
   * Retrieves a file buffer and metadata by key or URL.
   */
  public static async getFile(
    keyOrUrl: string
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    if (!keyOrUrl) return null;

    // Handle base64 data URLs
    if (keyOrUrl.startsWith('data:')) {
      const parts = keyOrUrl.split(';base64,');
      const mimeType = parts[0].replace('data:', '') || 'application/pdf';
      const buffer = Buffer.from(parts[1] || '', 'base64');
      return {
        buffer,
        mimeType,
        filename: 'submission.pdf',
      };
    }

    // Handle remote HTTP/HTTPS URLs (Vercel Blob or external S3)
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      try {
        const res = await fetch(keyOrUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const mimeType = res.headers.get('content-type') || 'application/octet-stream';
          const filename = path.basename(new URL(keyOrUrl).pathname) || 'download';
          return {
            buffer: Buffer.from(arrayBuffer),
            mimeType,
            filename,
          };
        }
      } catch (err: any) {
        logger.warn(`Failed to fetch remote file ${keyOrUrl}: ${err.message}`);
      }
      return null;
    }

    // Handle local file system
    const safeKey = keyOrUrl.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
    const localPath = path.join(this.uploadDir, safeKey);
    if (fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      const filename = path.basename(localPath);
      const ext = path.extname(filename).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.csv') mimeType = 'text/csv';
      return {
        buffer,
        mimeType,
        filename,
      };
    }

    // Handle Vercel Blob lookup by key when configured
    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const currentToken = process.env.BLOB_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;
    if (currentProvider === 'VERCEL_BLOB' && currentToken) {
      try {
        const blobDetails = await head(safeKey, { token: currentToken });
        if (blobDetails?.url) {
          const res = await fetch(blobDetails.url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            return {
              buffer: Buffer.from(arrayBuffer),
              mimeType: blobDetails.contentType || 'application/octet-stream',
              filename: path.basename(new URL(blobDetails.url).pathname) || 'download',
            };
          }
        }
      } catch (err: any) {
        logger.warn(`Could not fetch blob from Vercel Blob for key ${safeKey}: ${err.message}`);
      }
    }

    return null;
  }

  /**
   * Deletes a file from persistent storage (Vercel Blob or local disk).
   */
  public static async deleteFile(keyOrUrl: string): Promise<boolean> {
    if (!keyOrUrl) return false;

    // Vercel Blob deletion
    if (keyOrUrl.includes('blob.vercel-storage.com') || env.STORAGE_PROVIDER === 'VERCEL_BLOB') {
      if (env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(keyOrUrl, { token: env.BLOB_READ_WRITE_TOKEN });
          logger.info(`Deleted file from Vercel Blob: ${keyOrUrl}`);
          return true;
        } catch (err: any) {
          logger.warn(`Failed to delete from Vercel Blob: ${err.message}`);
        }
      }
    }

    // Local disk deletion
    try {
      const safeKey = keyOrUrl.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
      const localPath = path.join(this.uploadDir, safeKey);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        return true;
      }
    } catch (err: any) {
      logger.warn(`Failed to delete local file ${keyOrUrl}: ${err.message}`);
    }

    return false;
  }
}
