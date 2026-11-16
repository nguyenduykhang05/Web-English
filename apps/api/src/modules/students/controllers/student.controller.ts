import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  CefrEnum,
  GoalTypeEnum,
  StudentLifecycleEnum,
  UpdateStudentProfileSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  exportStudentsCsv,
  getStudentProfile,
  getStudentTimeline,
  listStudents,
  updateStudentProfile,
} from '../services/student.service.js';

const ListStudentsQuerySchema = z.object({
  lifecycleStatus: StudentLifecycleEnum.optional(),
  currentCefr: CefrEnum.optional(),
  goalType: GoalTypeEnum.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listStudentsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = ListStudentsQuerySchema.parse(req.query);
    const data = await listStudents(query, { id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getStudentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = !req.params.id || req.params.id === 'me' ? req.user.id : req.params.id;
    const data = await getStudentProfile(targetId, { id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateStudentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = !req.params.id || req.params.id === 'me' ? req.user.id : req.params.id;
    const body = UpdateStudentProfileSchema.parse(req.body);
    const data = await updateStudentProfile(targetId, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getStudentTimelineController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = !req.params.id || req.params.id === 'me' ? req.user.id : req.params.id;
    const data = await getStudentTimeline(targetId, { id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exportStudentsCsvController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const csv = await exportStudentsCsv({ id: req.user.id, role: req.user.role });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
}
