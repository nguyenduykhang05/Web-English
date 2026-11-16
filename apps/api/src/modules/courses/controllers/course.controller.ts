import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateCouponSchema,
  CreateCoursePackageSchema,
  CreateCourseSchema,
  GoalTypeEnum,
  UpdateCourseSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  createCoupon,
  createCourse,
  createCoursePackage,
  listCourses,
  updateCourse,
} from '../services/course.service.js';

const ListCoursesQuerySchema = z.object({
  goalType: GoalTypeEnum.optional(),
  includeUnpublished: z.coerce.boolean().optional(),
});

export async function listCoursesController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListCoursesQuerySchema.parse(req.query);
    const includeUnpublished = req.user?.role === 'admin' ? Boolean(query.includeUnpublished) : false;
    const data = await listCourses({ goalType: query.goalType, includeUnpublished });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCourseController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateCourseSchema.parse(req.body);
    const data = await createCourse(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateCourseController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = UpdateCourseSchema.parse(req.body);
    const data = await updateCourse(req.params.id, body, { id: req.user.id, ip: req.ip });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createPackageController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateCoursePackageSchema.parse(req.body);
    const data = await createCoursePackage(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCouponController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateCouponSchema.parse(req.body);
    const data = await createCoupon(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}
