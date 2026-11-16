import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  CefrEnum,
  CreateCustomVocabCardSchema,
  ImportYoutubeMediaSchema,
  ListDecksQuerySchema,
  ReviewPracticeAttemptSchema,
  ReviewSrsCardSchema,
  SubmitDictationAttemptSchema,
  SubmitShadowingAttemptSchema,
  ToggleStarCardSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  createCustomCard,
  getDeckWithCards,
  getPracticeStats,
  getSrsQueue,
  importYoutubeMediaLesson,
  listAttemptsForActor,
  listDecks,
  listIpaSymbols,
  listMediaLessons,
  lookupDictionaryWord,
  reviewPracticeAttempt,
  reviewSrsCard,
  submitDictationAttempt,
  submitShadowingAttempt,
  syncSessionVocabForStudent,
  toggleStarCard,
} from '../services/practice.service.js';

export async function listDecksController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListDecksQuerySchema.parse(req.query);
    const data = await listDecks(query, req.user ? { id: req.user.id, role: req.user.role } : undefined);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getDeckController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getDeckWithCards(
      req.params.id,
      req.user ? { id: req.user.id, role: req.user.role } : undefined,
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSrsQueueController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const deckId = typeof req.query.deckId === 'string' ? req.query.deckId : undefined;
    const data = await getSrsQueue(req.user.id, deckId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function reviewSrsCardController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = ReviewSrsCardSchema.parse(req.body);
    const data = await reviewSrsCard(req.user.id, body.cardId, body.rating);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function toggleStarCardController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = ToggleStarCardSchema.parse(req.body);
    const data = await toggleStarCard(req.user.id, req.params.cardId, body.starred);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createCustomCardController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateCustomVocabCardSchema.parse(req.body);
    const data = await createCustomCard(req.user.id, body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function syncSessionVocabController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await syncSessionVocabForStudent(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listIpaController(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listIpaSymbols();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listMediaLessonsController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        cefrLevel: CefrEnum.optional(),
        topic: z.string().trim().optional(),
      })
      .parse(req.query);
    const data = await listMediaLessons(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function submitDictationController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = SubmitDictationAttemptSchema.parse(req.body);
    const data = await submitDictationAttempt(req.user.id, body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function submitShadowingController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = SubmitShadowingAttemptSchema.parse(req.body);
    const data = await submitShadowingAttempt(req.user.id, body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listAttemptsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = z
      .object({
        studentId: z.string().optional(),
        lessonId: z.string().optional(),
        proposedStatus: z.enum(['proposed', 'approved', 'needs_retry']).optional(),
      })
      .parse(req.query);
    const data = await listAttemptsForActor({ id: req.user.id, role: req.user.role }, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function reviewAttemptController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = ReviewPracticeAttemptSchema.parse(req.body);
    const data = await reviewPracticeAttempt(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
