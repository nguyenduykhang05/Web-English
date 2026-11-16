import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function listNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = QuerySchema.parse(req.query);
    const data = await listNotificationsForUser(req.user.id, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function markReadController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await markNotificationRead(req.params.id, req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function markAllReadController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await markAllNotificationsRead(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
