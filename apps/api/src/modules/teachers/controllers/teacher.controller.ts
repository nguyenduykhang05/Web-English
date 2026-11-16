import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { CefrEnum, GoalTypeEnum, UpsertTeacherProfileSchema } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  getTeacherProfile,
  listTeachers,
  upsertTeacherProfile,
} from '../services/teacher.service.js';

const ListTeachersQuerySchema = z.object({
  specialty: GoalTypeEnum.optional(),
  cefr: CefrEnum.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listTeachersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListTeachersQuerySchema.parse(req.query);
    const data = await listTeachers(query, req.user?.role);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getTeacherController(req: Request, res: Response, next: NextFunction) {
  try {
    const isMe = !req.params.id || req.params.id === 'me';
    if (isMe && !req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = isMe && req.user ? req.user.id : req.params.id;
    const data = await getTeacherProfile(
      targetId,
      req.user ? { id: req.user.id, role: req.user.role } : undefined,
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function upsertTeacherController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = !req.params.id || req.params.id === 'me' ? req.user.id : req.params.id;
    const body = UpsertTeacherProfileSchema.parse(req.body);
    const data = await upsertTeacherProfile(targetId, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
