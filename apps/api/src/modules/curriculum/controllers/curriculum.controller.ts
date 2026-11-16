import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  CefrEnum,
  CreateHomeworkSchema,
  CreateLessonSchema,
  GoalTypeEnum,
  GradeHomeworkSchema,
  ListHomeworkQuerySchema,
  SkillKeyEnum,
  SubmitHomeworkSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  createHomework,
  createLesson,
  gradeHomework,
  listHomeworkForActor,
  listLessons,
  submitHomework,
} from '../services/curriculum.service.js';

const ListLessonsQuerySchema = z.object({
  goalType: GoalTypeEnum.optional(),
  cefrLevel: CefrEnum.optional(),
  skillFocus: SkillKeyEnum.optional(),
});

export async function listLessonsController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListLessonsQuerySchema.parse(req.query);
    const data = await listLessons(query, req.user?.role);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createLessonController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateLessonSchema.parse(req.body);
    const data = await createLesson(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listHomeworkController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = ListHomeworkQuerySchema.parse(req.query);
    const data = await listHomeworkForActor({ id: req.user.id, role: req.user.role }, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createHomeworkController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateHomeworkSchema.parse(req.body);
    const data = await createHomework(body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function submitHomeworkController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = SubmitHomeworkSchema.parse(req.body);
    const data = await submitHomework(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function gradeHomeworkController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = GradeHomeworkSchema.parse(req.body);
    const data = await gradeHomework(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
