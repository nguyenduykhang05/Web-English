import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  InviteTeacherBodySchema,
  UpdateProfileBodySchema,
  UserRoleEnum,
  UserStatusEnum,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  getUserById,
  inviteTeacher,
  listUsers,
  unlockUserAccount,
  updateUserProfile,
} from '../services/user.service.js';

const ListUsersQuerySchema = z.object({
  role: UserRoleEnum.optional(),
  status: UserStatusEnum.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListUsersQuerySchema.parse(req.query);
    const data = await listUsers(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
}

export async function inviteTeacherController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const input = InviteTeacherBodySchema.parse(req.body);
    const data = await inviteTeacher(input, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function updateUserController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const input = UpdateProfileBodySchema.parse(req.body);
    const updated = await updateUserProfile(req.params.id, input, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}

export async function unlockUserController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const updated = await unlockUserAccount(req.params.id, { id: req.user.id, ip: req.ip });
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
}
