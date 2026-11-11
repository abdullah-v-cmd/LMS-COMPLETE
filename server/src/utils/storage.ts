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

  /**
   * Retrieves the read/write token for the private Vercel Blob store.
   * Fallback priority: BLOB_PRIVATE_READ_WRITE_TOKEN -> BLOB_READ_WRITE_TOKEN.
   */
  public static getPrivateToken(): string | undefined {
    return (
      process.env.BLOB_PRIVATE_READ_WRITE_TOKEN ||
      env.BLOB_PRIVATE_READ_WRITE_TOKEN ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      env.BLOB_READ_WRITE_TOKEN
    );
  }

  /**
   * Retrieves the read/write token for the public Vercel Blob store.
   * Explicitly requires BLOB_PUBLIC_READ_WRITE_TOKEN.
   */
  public static getPublicToken(): string | undefined {
    return (
      process.env.BLOB_PUBLIC_READ_WRITE_TOKEN ||
      env.BLOB_PUBLIC_READ_WRITE_TOKEN
    );
  }

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
    const normalized = rawFilename.replace(/\\/g, '/');
    const basename = path.posix.basename(normalized).replace(/[^a-zA-Z0-9._-]/g, '_');
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
   * Sensitive folders are strictly written to the private Blob store (access: 'private')
   * and served strictly via the authenticated LMS gateway (/api/v1/storage/${storageKey}).
   * Public assets (avatars, general) use the public Blob store if BLOB_PUBLIC_READ_WRITE_TOKEN is set,
   * or fallback to the private store with gateway proxying if only private store is available.
   */
  public static async uploadFile(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    options: { folder?: StorageFolder | string; isPublic?: boolean } = {}
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
    const isSensitive = SENSITIVE_FOLDERS.has(folder);

    // Defense-in-depth: Sensitive documents can NEVER be marked as public or uploaded to a public store
    if (options.isPublic === true && isSensitive) {
      throw {
        status: 400,
        message: `Security violation: Sensitive folder '${folder}' cannot be stored in a public store or marked as public.`,
      };
    }

    const storageKey = `${folder}/${uniquePrefix}-${safeName}`;
    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;
    const isProduction = (process.env.NODE_ENV || env.NODE_ENV) === 'production';

    // Provider: Vercel Blob (Production standard)
    if (currentProvider === 'VERCEL_BLOB') {
      const privateToken = this.getPrivateToken();
      const publicToken = this.getPublicToken();

      // Determine store separation:
      // Sensitive files ALWAYS use the private store with access: 'private'.
      // Non-sensitive files use the public store IF publicToken is available and not marked private.
      const usePublicStore = !isSensitive && options.isPublic !== false && Boolean(publicToken);
      const token = usePublicStore ? publicToken : privateToken;
      const accessMode: 'public' | 'private' = usePublicStore ? 'public' : 'private';

      if (!token) {
        const missingVar = usePublicStore
          ? 'BLOB_PUBLIC_READ_WRITE_TOKEN'
          : 'BLOB_PRIVATE_READ_WRITE_TOKEN (or BLOB_READ_WRITE_TOKEN)';
        throw new Error(
          `${missingVar} is missing. Vercel Blob ${accessMode} storage requires a valid read/write token.`
        );
      }

      try {
        const blob = await put(storageKey, buffer, {
          access: accessMode,
          token,
          contentType: mimeType,
        });

        logger.info(
          `File uploaded to Vercel Blob (${accessMode} store): ${storageKey} (${buffer.length} bytes)`
        );

        // Sensitive documents are routed strictly through the authenticated LMS gateway
        // Original private blob URLs are NEVER returned to clients or logged
        const resolvedUrl = usePublicStore ? blob.url : `/api/v1/storage/${storageKey}`;

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

    const privateToken = this.getPrivateToken();
    const publicToken = this.getPublicToken();
    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;

    // Handle remote HTTP/HTTPS URLs (Vercel Blob or external S3)
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      try {
        const headers: Record<string, string> = {};
        if (keyOrUrl.includes('blob.vercel-storage.com')) {
          // If accessing a private Vercel Blob URL, attach the private store bearer token
          if (keyOrUrl.includes('.private.blob.vercel-storage.com') && privateToken) {
            headers['Authorization'] = `Bearer ${privateToken}`;
          }
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
    if (currentProvider === 'VERCEL_BLOB') {
      try {
        const parts = safeKey.split('/').filter(Boolean);
        const folder = (parts[0] || '').toLowerCase();
        const isSensitive = SENSITIVE_FOLDERS.has(folder);

        let blobRes: any = null;

        if (isSensitive) {
          if (privateToken) {
            blobRes = await get(safeKey, {
              access: 'private',
              token: privateToken,
            });
          }
        } else {
          // Public or non-sensitive asset: try public store first if configured, then private store
          if (publicToken) {
            try {
              blobRes = await get(safeKey, {
                access: 'public',
                token: publicToken,
              });
            } catch {
              // Not found in public store, proceed to private store
            }
          }
          if (!blobRes && privateToken) {
            try {
              blobRes = await get(safeKey, {
                access: 'private',
                token: privateToken,
              });
            } catch {
              // Not found in private store either
            }
          }
        }

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

    const privateToken = this.getPrivateToken();
    const publicToken = this.getPublicToken();
    const currentProvider = process.env.STORAGE_PROVIDER || env.STORAGE_PROVIDER;

    // Vercel Blob deletion
    if (keyOrUrl.includes('blob.vercel-storage.com') || currentProvider === 'VERCEL_BLOB') {
      const safeKey = keyOrUrl.replace(/^\/api\/v1\/storage\//, '').replace(/\.\./g, '');
      const parts = safeKey.split('/').filter(Boolean);
      const folder = (parts[0] || '').toLowerCase();
      const isSensitive = SENSITIVE_FOLDERS.has(folder);

      try {
        if (isSensitive) {
          if (privateToken) {
            await del(safeKey, { token: privateToken });
            logger.info(`Deleted sensitive file from private Vercel Blob: ${safeKey}`);
            return true;
          }
        } else {
          // Public or non-sensitive asset: attempt deletion with public token, fallback to private token
          if (publicToken) {
            try {
              await del(safeKey, { token: publicToken });
              logger.info(`Deleted public asset from public Vercel Blob: ${safeKey}`);
              return true;
            } catch {
              // Try private store next
            }
          }
          if (privateToken) {
            await del(safeKey, { token: privateToken });
            logger.info(`Deleted asset from private Vercel Blob: ${safeKey}`);
            return true;
          }
        }
      } catch (err: any) {
        logger.warn(`Failed to delete from Vercel Blob: ${err.message}`);
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
