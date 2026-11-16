import type { NextFunction, Request, Response } from 'express';
import {
  AnswerPlacementStepSchema,
  CreatePathTemplateSchema,
  GenerateLearningPathSchema,
  MilestoneDecisionSchema,
  UpdateMilestoneProgressSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  createPathTemplate,
  decideMilestoneProposal,
  generatePersonalizedPath,
  getActiveLearningPath,
  listPathTemplates,
  updateMilestoneProgress,
} from '../services/learningPath.service.js';
import {
  answerPlacementStep,
  startPlacementTest,
} from '../services/placement.service.js';

export async function listTemplatesController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await listPathTemplates();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createTemplateController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreatePathTemplateSchema.parse(req.body);
    const data = await createPathTemplate(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function startPlacementController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await startPlacementTest(req.user.id);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function answerPlacementController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AnswerPlacementStepSchema.parse(req.body);
    const data = await answerPlacementStep(req.params.assessmentId, req.user.id, body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function generatePathController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = GenerateLearningPathSchema.parse(req.body ?? {});
    const data = await generatePersonalizedPath(body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getLearningPathController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetId =
      !req.params.studentId || req.params.studentId === 'me'
        ? req.user.id
        : req.params.studentId;
    const data = await getActiveLearningPath(targetId, {
      id: req.user.id,
      role: req.user.role,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function decideMilestoneController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = MilestoneDecisionSchema.parse(req.body);
    const data = await decideMilestoneProposal(
      req.params.pathId,
      req.params.milestoneId,
      body,
      { id: req.user.id, role: req.user.role, ip: req.ip },
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateMilestoneProgressController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = UpdateMilestoneProgressSchema.parse(req.body);
    const data = await updateMilestoneProgress(
      req.params.pathId,
      req.params.milestoneId,
      body,
      { id: req.user.id, role: req.user.role, ip: req.ip },
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
