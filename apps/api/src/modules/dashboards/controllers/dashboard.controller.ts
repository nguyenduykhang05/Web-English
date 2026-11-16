import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  getAdminDashboard,
  getStudentDashboard,
  getTeacherDashboard,
} from '../services/dashboard.service.js';

export async function studentDashboardController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await getStudentDashboard(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function teacherDashboardController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await getTeacherDashboard(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function adminDashboardController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await getAdminDashboard();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
