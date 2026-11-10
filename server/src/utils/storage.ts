import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from './logger';

export interface StoredFile {
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

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
   * Uploads a file buffer to persistent storage (Vercel Blob, S3, or Local fallback).
   */
  public static async uploadFile(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    options: { folder?: string } = {}
  ): Promise<StoredFile> {
    const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw {
        status: 400,
        message: `File size exceeds the allowed limit of ${env.MAX_FILE_SIZE_MB}MB.`,
      };
    }

    const safeName = this.sanitizeFilename(originalFilename);
    const uniquePrefix = crypto.randomUUID();
    const folder = options.folder ? options.folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'general';
    const storageKey = `${folder}/${uniquePrefix}-${safeName}`;

    // Provider: Vercel Blob (when token is configured)
    if (env.STORAGE_PROVIDER === 'VERCEL_BLOB' && env.BLOB_READ_WRITE_TOKEN) {
      try {
        const response = await fetch(`https://blob.vercel-storage.com/${storageKey}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}`,
            'x-content-type': mimeType,
          },
          body: buffer,
        });

        if (response.ok) {
          const data = (await response.json()) as { url: string };
          return {
            key: storageKey,
            url: data.url,
            filename: safeName,
            mimeType,
            size: buffer.length,
          };
        }
      } catch (err: any) {
        logger.error(`Vercel Blob upload failed, falling back: ${err.message}`);
      }
    }

    // Default / Local disk storage fallback
    this.ensureLocalUploadDir();
    const targetFolder = path.join(this.uploadDir, folder);
    if (!fs.existsSync(targetFolder)) {
      try {
        fs.mkdirSync(targetFolder, { recursive: true });
      } catch (err: any) {
        // Fallback to /tmp in serverless if root filesystem is read-only
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
   * Retrieves a file buffer by key or URL.
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

    // Handle external HTTP/S3/Blob URLs
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
      return {
        buffer,
        mimeType,
        filename,
      };
    }

    return null;
  }
}

