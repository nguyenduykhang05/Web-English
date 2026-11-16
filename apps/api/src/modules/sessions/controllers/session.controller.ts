import type { NextFunction, Request, Response } from 'express';
import {
  CancelSessionSchema,
  CreateBookingSchema,
  CreateQuickNoteSchema,
  GetSlotsQuerySchema,
  ListSessionsQuerySchema,
  RescheduleSessionSchema,
  UpdateSharedNotesSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  addClassroomQuickNote,
  endSession,
  joinClassroom,
  startSession,
  updateClassroomSharedNotes,
} from '../services/classroom.service.js';
import {
  cancelSession,
  createBooking,
  generateSessionIcs,
  getSessionById,
  listSessionsForActor,
  rescheduleSession,
} from '../services/session.service.js';
import { calculateAvailableSlots } from '../services/slot.service.js';

export async function getAvailableSlotsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = GetSlotsQuerySchema.parse(req.query);
    const data = await calculateAvailableSlots({
      teacherId: query.teacherId,
      fromIso: query.from,
      days: query.days,
      durationMinutes: query.durationMinutes,
      studentTimezone: req.user?.timezone,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = ListSessionsQuerySchema.parse(req.query);
    const data = await listSessionsForActor({ id: req.user.id, role: req.user.role }, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await getSessionById(req.params.id, { id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createBookingController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateBookingSchema.parse(req.body);
    const data = await createBooking(body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function rescheduleSessionController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = RescheduleSessionSchema.parse(req.body);
    const data = await rescheduleSession(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function cancelSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CancelSessionSchema.parse(req.body ?? {});
    const data = await cancelSession(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function downloadSessionIcsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const ics = await generateSessionIcs(req.params.id, { id: req.user.id, role: req.user.role });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ics.filename}"`);
    res.status(200).send(ics.content);
  } catch (err) {
    next(err);
  }
}

export async function joinClassroomController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await joinClassroom(req.params.id, { id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function startSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await startSession(req.params.id, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function endSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await endSession(req.params.id, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateSharedNotesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = UpdateSharedNotesSchema.parse(req.body);
    const data = await updateClassroomSharedNotes(req.params.id, body.content, {
      id: req.user.id,
      role: req.user.role,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function addQuickNoteController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateQuickNoteSchema.parse(req.body);
    const data = await addClassroomQuickNote(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}
