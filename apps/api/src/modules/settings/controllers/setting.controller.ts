import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { UpsertSettingBodySchema } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  listAllSettings,
  listAuditLogs,
  upsertSetting,
} from '../services/setting.service.js';

const AuditLogQuerySchema = z.object({
  action: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function getSettingsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await listAllSettings();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function putSettingController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const body = UpsertSettingBodySchema.parse(req.body);
    const data = await upsertSetting(body.key, body.value, {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = AuditLogQuerySchema.parse(req.query);
    const data = await listAuditLogs(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
