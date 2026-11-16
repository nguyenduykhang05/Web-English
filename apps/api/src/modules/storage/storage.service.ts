import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB strict cap

export const ALLOWED_UPLOAD_MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'audio/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a', '.mp4'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'application/pdf': ['.pdf'],
};

export function validateUploadInput(input: {
  folder: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): { safeFolder: string; ext: string; normalizedMime: string } {
  const normalizedMime = input.mimeType.split(';')[0].trim().toLowerCase();
  const allowedExts = ALLOWED_UPLOAD_MIME_EXTENSIONS[normalizedMime];
  if (!allowedExts) {
    throw new AppError(
      400,
      'UNSUPPORTED_MEDIA_TYPE',
      `Unsupported MIME type "${input.mimeType}". Allowed: ${Object.keys(ALLOWED_UPLOAD_MIME_EXTENSIONS).join(', ')}`,
    );
  }

  if (!input.buffer || input.buffer.byteLength === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Uploaded file cannot be empty');
  }
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(
      413,
      'PAYLOAD_TOO_LARGE',
      `File exceeds maximum size limit of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
    );
  }

  const baseName = path.basename(input.originalName);
  const ext = path.extname(baseName).toLowerCase();
  if (!allowedExts.includes(ext)) {
    throw new AppError(
      400,
      'UNSUPPORTED_MEDIA_TYPE',
      `File extension "${ext || '(none)'}" does not match MIME type ${normalizedMime}`,
    );
  }

  const safeFolder = input.folder.replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
  return { safeFolder, ext, normalizedMime };
}

export interface StoredFileMeta {
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface StorageService {
  readonly kind: 'local' | 'mock';
  putObject(input: {
    folder: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<StoredFileMeta>;
  getObject(key: string): Promise<Buffer>;
}

export class LocalDiskStorageService implements StorageService {
  readonly kind = 'local' as const;
  private readonly rootDir = path.resolve(process.cwd(), 'uploads');

  async putObject(input: {
    folder: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<StoredFileMeta> {
    const { safeFolder, ext, normalizedMime } = validateUploadInput(input);
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const key = path.posix.join(safeFolder, filename);
    const fullPath = path.join(this.rootDir, key);

    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, input.buffer);

    return {
      key,
      originalName: path.basename(input.originalName),
      mimeType: normalizedMime,
      sizeBytes: input.buffer.byteLength,
      url: `/api/v1/storage/files/${key}`,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    if (key.includes('..') || path.isAbsolute(key)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid storage key path');
    }
    const target = path.resolve(this.rootDir, key);
    if (!target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid storage key path');
    }
    try {
      return await readFile(target);
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Stored file not found');
    }
  }
}

export class MockStorageService implements StorageService {
  readonly kind = 'mock' as const;
  private readonly store = new Map<string, Buffer>();

  async putObject(input: {
    folder: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }): Promise<StoredFileMeta> {
    const { safeFolder, ext, normalizedMime } = validateUploadInput(input);
    const key = `${safeFolder}/${randomUUID().slice(0, 8)}${ext}`;
    this.store.set(key, input.buffer);
    return {
      key,
      originalName: path.basename(input.originalName),
      mimeType: normalizedMime,
      sizeBytes: input.buffer.byteLength,
      url: `mock://storage/${key}`,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    if (key.includes('..') || path.isAbsolute(key)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid storage key path');
    }
    const found = this.store.get(key);
    if (!found) throw new AppError(404, 'NOT_FOUND', 'Stored file not found');
    return found;
  }
}

const localStorage = new LocalDiskStorageService();
const mockStorage = new MockStorageService();

export function getStorageService(): StorageService {
  const mode = process.env.STORAGE_PROVIDER ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'local');
  return mode === 'mock' ? mockStorage : localStorage;
}
