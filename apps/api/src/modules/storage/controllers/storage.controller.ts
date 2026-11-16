import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../middleware/errorHandler.js';
import { getStorageService, MAX_UPLOAD_BYTES } from '../storage.service.js';

const JsonUploadSchema = z.object({
  folder: z.string().trim().min(1).max(40).default('general'),
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().min(3).max(100),
  dataBase64: z.string().min(1),
});

export async function uploadFileController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');

    let folder = 'general';
    let originalName = '';
    let mimeType = '';
    let buffer: Buffer;

    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
      originalName = String(req.headers['x-file-name'] ?? '');
      folder = String(req.headers['x-folder'] ?? 'general');
      mimeType = String(req.headers['content-type'] ?? '');
    } else {
      const parsed = JsonUploadSchema.parse(req.body);
      folder = parsed.folder;
      originalName = parsed.fileName;
      mimeType = parsed.mimeType;
      buffer = Buffer.from(parsed.dataBase64, 'base64');
    }

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        `File exceeds maximum size limit of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
      );
    }

    const stored = await getStorageService().putObject({
      folder,
      originalName,
      mimeType,
      buffer,
    });

    res.status(201).json({ data: stored });
  } catch (err) {
    next(err);
  }
}

export async function downloadFileController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const folder = req.params.folder;
    const filename = req.params.filename;
    const key = `${folder}/${filename}`;
    const data = await getStorageService().getObject(key);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(data);
  } catch (err) {
    next(err);
  }
}
