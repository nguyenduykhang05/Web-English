import type { NextFunction, Request, Response } from 'express';
import {
  AiExerciseGenSchema,
  AiMatchingExplainSchema,
  AiPathProposalSchema,
  AiPlacementExplainSchema,
  AiSessionSummarySchema,
  AiSpeakingRequestSchema,
  AiWeaknessAnalysisSchema,
  AiWritingRequestSchema,
  DecideAiProposalSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  aiAnalyzeWeaknesses,
  aiAssessSpeaking,
  aiAssessWriting,
  aiExplainMatching,
  aiExplainPlacement,
  aiGenerateExercise,
  aiProposeLearningPath,
  aiSummarizeSession,
  decideAiLogProposal,
  listAiLogs,
} from '../services/ai.service.js';

export async function writingAssessmentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiWritingRequestSchema.parse(req.body);
    const data = await aiAssessWriting(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function speakingAssessmentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiSpeakingRequestSchema.parse(req.body);
    const data = await aiAssessSpeaking(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function placementExplanationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiPlacementExplainSchema.parse(req.body);
    const data = await aiExplainPlacement(body.assessmentId, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function pathProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiPathProposalSchema.parse(req.body ?? {});
    const data = await aiProposeLearningPath(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exerciseGenController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiExerciseGenSchema.parse(req.body);
    const data = await aiGenerateExercise(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function sessionSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiSessionSummarySchema.parse(req.body);
    const data = await aiSummarizeSession(body.sessionId, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function weaknessAnalysisController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiWeaknessAnalysisSchema.parse(req.body ?? {});
    const data = await aiAnalyzeWeaknesses(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function matchingExplainController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = AiMatchingExplainSchema.parse(req.body);
    const data = await aiExplainMatching(body, { id: req.user.id, role: req.user.role });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listAiLogsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await listAiLogs(
      { id: req.user.id, role: req.user.role },
      {
        studentId: typeof req.query.studentId === 'string' ? req.query.studentId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      },
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function decideAiProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = DecideAiProposalSchema.parse(req.body);
    const data = await decideAiLogProposal(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
