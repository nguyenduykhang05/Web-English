import type { NextFunction, Request, Response } from 'express';
import {
  CreateSessionReportSchema,
  CreateSessionReviewSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  getSessionReport,
  listStudentProgress,
  submitOrUpdateSessionReport,
  submitSessionReview,
} from '../services/report.service.js';

export async function submitReportController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateSessionReportSchema.parse(req.body);
    const data = await submitOrUpdateSessionReport(req.params.sessionId, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSessionReportController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await getSessionReport(req.params.sessionId, {
      id: req.user.id,
      role: req.user.role,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function submitReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateSessionReviewSchema.parse(req.body);
    const data = await submitSessionReview(req.params.sessionId, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getStudentProgressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId = req.params.studentId === 'me' ? req.user.id : req.params.studentId;
    const data = await listStudentProgress(targetId, {
      id: req.user.id,
      role: req.user.role,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
