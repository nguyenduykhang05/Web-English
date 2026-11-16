import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFoundHandler(
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
}

interface ErrorWithMetadata {
  type?: string;
  name?: string;
  code?: number | string;
  statusCode?: number;
  message?: string;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.flatten().fieldErrors,
        requestId,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
  }

  const meta = (typeof err === 'object' && err !== null ? err : {}) as ErrorWithMetadata;

  if (meta.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body', requestId },
    });
  }

  if (meta.type === 'entity.too.large' || meta.statusCode === 413) {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds allowed upload limit', requestId },
    });
  }

  if (meta.name === 'CastError') {
    return res.status(400).json({
      error: { code: 'INVALID_ID', message: 'Malformed resource identifier', requestId },
    });
  }

  if (meta.code === 11000) {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'Duplicate resource value',
        details: meta.keyValue,
        requestId,
      },
    });
  }

  if (meta.code === 112) {
    return res.status(409).json({
      error: {
        code: 'SLOT_CONFLICT',
        message: 'Concurrent booking conflict, please pick another time slot',
        requestId,
      },
    });
  }

  const message = err instanceof Error ? err.message : 'Internal Server Error';
  const statusCode = typeof meta.statusCode === 'number' ? meta.statusCode : 500;
  return res.status(statusCode).json({
    error: { code: 'INTERNAL_ERROR', message, requestId },
  });
}
