import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function containsUnsafeMongoKey(value: unknown, depth = 0): string | null {
  if (depth > 16 || value === null || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const unsafe = containsUnsafeMongoKey(item, depth + 1);
      if (unsafe) return unsafe;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(record)) {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
      return key;
    }
    const unsafeNested = containsUnsafeMongoKey(record[key], depth + 1);
    if (unsafeNested) return unsafeNested;
  }

  return null;
}

/**
 * Prevents NoSQL operator injection ($ne, $gt, $where...) and MongoDB dot-notation key injection
 * across request body, query parameters, and route params before reaching controllers or services.
 */
export function sanitizeNoSqlInput(req: Request, _res: Response, next: NextFunction): void {
  const badKey =
    containsUnsafeMongoKey(req.body) ??
    containsUnsafeMongoKey(req.query) ??
    containsUnsafeMongoKey(req.params);

  if (badKey) {
    next(
      new AppError(
        400,
        'VALIDATION_ERROR',
        `Rejected unsafe key "${badKey}" in request input`,
      ),
    );
    return;
  }

  next();
}
