import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { put, del, head, get } from '@vercel/blob';
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
  | 'counseling'
  | 'avatars'
  | 'general';

export const SENSITIVE_FOLDERS = new Set<string>([
  'students',
  'teachers',
  'courses',
  'assignments',
  'submissions',
  'exams',
  'counseling',
]);

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
  '.msi',
  '.scr',
  '.dll',
  '.so',
  '.dylib',
  '.com',
  '.pif',
  '.application',
  '.gadget',
  '.hta',
  '.cpl',
  '.msc',
  '.reg',
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
   * Validates file extension against prohibited executable and script types.
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
   * Validates file signature (magic bytes) to prevent executable spoofing and polyglot attacks.
   */
  public static validateFileSignature(
    buffer: Buffer,
    filename: string,
    mimeType?: string
  ): void {
    if (!buffer || buffer.length === 0) {
      throw {
        status: 400,
        message: 'File buffer cannot be empty.',
      };
    }

    // 1. Prohibit executable headers (Windows PE/MZ, Linux ELF, scripts, Mach-O/Java)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      // 'MZ' DOS / Windows PE Executable
      throw {
        status: 400,
        message: 'Executable files (Windows PE/MZ) are strictly prohibited.',
      };
    }

    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      // '\x7fELF' Linux Executable
      throw {
        status: 400,
        message: 'Executable files (Linux ELF) are strictly prohibited.',
      };
    }

    if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
      // '#!' Shebang script header
      throw {
        status: 400,
        message: 'Script files with shebang headers are strictly prohibited.',
      };
    }

    if (
      buffer.length >= 4 &&
      buffer[0] === 0xca &&
      buffer[1] === 0xfe &&
      buffer[2] === 0xba &&
      buffer[3] === 0xbe
    ) {
      // Mach-O Fat Binary or Java Class bytecode
      throw {
        status: 400,
        message: 'Compiled class files and binary wrappers are strictly prohibited.',
      };
    }

    const ext = path.extname(filename).toLowerCase();

    // 2. Format-specific magic byte verification
    if (ext === '.pdf') {
      const header = buffer.subarray(0, 5).toString('ascii');
      if (!header.startsWith('%PDF-')) {
        throw {
          status: 400,
          message: 'Invalid PDF format: file missing standard %PDF- magic bytes header.',
        };
      }
    } else if (ext === '.png') {
      const isPng =
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;
      if (!isPng) {
        throw {
          status: 400,
          message: 'Invalid PNG format: file signature does not match image/png specifications.',
        };
      }
    } else if (ext === '.jpg' || ext === '.jpeg') {
      const isJpg =
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;
      if (!isJpg) {
        throw {
          status: 400,
          message: 'Invalid JPEG format: file signature does not match image/jpeg specifications.',
        };
      }
    } else if (ext === '.webp') {
      const isWebp =
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!isWebp) {
        throw {
          status: 400,
          message: 'Invalid WEBP format: file signature does not match image/webp specifications.',
        };
      }
    } else if (ext === '.gif') {
      const header = buffer.subarray(0, 6).toString('ascii');
      if (!header.startsWith('GIF87a') && !header.startsWith('GIF89a')) {
        throw {
          status: 400,
          message: 'Invalid GIF format: file signature does not match image/gif specifications.',
        };
      }
    } else if (ext === '.csv' || ext === '.txt') {
      // Reject binary null bytes inside text/csv files (polyglots)
      if (buffer.subarray(0, Math.min(buffer.length, 1024)).includes(0x00)) {
        throw {
          status: 400,
          message: 'Text and CSV files must not contain binary null bytes.',
        };
      }
    }
  }

  /**
   * Uploads a file buffer to persistent storage (Vercel Blob, S3, or Local fallback).
   * In production, Vercel Blob is enforced and silent fallback to local/memory is strictly rejected.
   * Sensitive files are assigned access: 'private' in Vercel Blob and served strictly via the authenticated LMS gateway.
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
    this.validateFileSignature(buffer, originalFilename, mimeType);

    const safeName = this.sanitizeFilename(originalFilename);
    const uniquePrefix = crypto.randomUUID();
    const folder = options.folder ? options.folder.replace(/[^a-zA-Z0-9_-]/g, '') : 'general';
    const storageKey = `${folder}/${uniquePrefix}-${safeName}`;

    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const currentToken = process.env.BLOB_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;
    const isProduction = (process.env.NODE_ENV || env.NODE_ENV) === 'production';
    const isSensitive = SENSITIVE_FOLDERS.has(folder);

    // Provider: Vercel Blob (Production standard)
    if (currentProvider === 'VERCEL_BLOB') {
      if (!currentToken) {
        throw new Error(
          'BLOB_READ_WRITE_TOKEN is missing. Vercel Blob storage requires a valid read/write token.'
        );
      }

      try {
        const blob = await put(storageKey, buffer, {
          access: isSensitive ? 'private' : 'public',
          token: currentToken,
          contentType: mimeType,
        });

        logger.info(`File uploaded to Vercel Blob (${isSensitive ? 'private' : 'public'}): ${storageKey} (${buffer.length} bytes)`);

        // Sensitive documents are routed through the authenticated LMS gateway
        // Original private blob URLs are NEVER returned to clients or logged
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
   * Handles local filesystem, remote HTTP/HTTPS, and Vercel Blob private/public access.
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

    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const currentToken = process.env.BLOB_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;

    // Handle remote HTTP/HTTPS URLs (Vercel Blob or external S3)
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      try {
        const headers: Record<string, string> = {};
        if (currentToken && keyOrUrl.includes('blob.vercel-storage.com')) {
          headers['Authorization'] = `Bearer ${currentToken}`;
        }
        const res = await fetch(keyOrUrl, { headers });
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
    let cleanKey = keyOrUrl;
    if (cleanKey.startsWith('http://') || cleanKey.startsWith('https://')) {
      try {
        cleanKey = new URL(cleanKey).pathname;
      } catch {
        // fallback
      }
    }
    const safeKey = cleanKey.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
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
    if (currentProvider === 'VERCEL_BLOB' && currentToken) {
      try {
        const parts = safeKey.split('/').filter(Boolean);
        const folder = (parts[0] || '').toLowerCase();
        const isSensitive = SENSITIVE_FOLDERS.has(folder);

        // Fetch via official Vercel Blob get() API with private access token
        const blobRes = await get(safeKey, {
          access: isSensitive ? 'private' : 'public',
          token: currentToken,
        });

        if (blobRes && blobRes.stream) {
          const chunks: Buffer[] = [];
          for await (const chunk of blobRes.stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          return {
            buffer,
            mimeType: blobRes.blob.contentType || 'application/octet-stream',
            filename: path.basename(blobRes.blob.pathname) || 'download',
          };
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

    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const currentToken = process.env.BLOB_READ_WRITE_TOKEN || env.BLOB_READ_WRITE_TOKEN;

    // Vercel Blob deletion
    if (keyOrUrl.includes('blob.vercel-storage.com') || currentProvider === 'VERCEL_BLOB') {
      if (currentToken) {
        try {
          const safeKey = keyOrUrl.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
          await del(safeKey, { token: currentToken });
          logger.info(`Deleted file from Vercel Blob: ${safeKey}`);
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
