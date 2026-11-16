import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AdvanceAlertSchema, AlertStatusEnum } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  advanceQualityAlert,
  getTeacherQualityMetrics,
  listAllTeachersQualityMetrics,
  listQualityAlerts,
} from '../services/quality.service.js';

const ListAlertsQuerySchema = z.object({
  status: AlertStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function listAlertsController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListAlertsQuerySchema.parse(req.query);
    const data = await listQualityAlerts(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function advanceAlertController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AdvanceAlertSchema.parse(req.body);
    const data = await advanceQualityAlert(req.params.id, body, {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listTeacherMetricsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await listAllTeachersQualityMetrics();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getTeacherMetricsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = req.params.teacherId === 'me' ? req.user.id : req.params.teacherId;
    if (req.user.role === 'teacher' && req.user.id !== targetId) {
      throw new AppError(403, 'FORBIDDEN', 'Teachers can only view their own quality metrics');
    }
    const data = await getTeacherQualityMetrics(targetId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
