import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@webenglish/shared';
import { env } from '../config/env.js';
import { User } from '../modules/users/models/user.model.js';

export interface AuthPayload {
  sub: string;
  role: UserRole;
}

export async function loadAuthenticatedUser(bearer: string): Promise<
  | { ok: true; user: NonNullable<Request['user']> }
  | { ok: false; status: number; code: string; message: string }
> {
  let payload: AuthPayload;
  try {
    payload = jwt.verify(bearer, env.JWT_ACCESS_SECRET) as AuthPayload;
  } catch {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Invalid or expired access token' };
  }

  const user = await User.findById(payload.sub).select('-passwordHash').lean();
  if (!user) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'User account not found' };
  }

  if (user.status === 'locked') {
    const stillLocked = !user.lockedUntil || user.lockedUntil > new Date();
    if (stillLocked) {
      return { ok: false, status: 401, code: 'ACCOUNT_LOCKED', message: 'Account is locked' };
    }
  }

  if (user.status === 'pending') {
    return { ok: false, status: 403, code: 'ACCOUNT_PENDING', message: 'Account setup not completed' };
  }

  return {
    ok: true,
    user: {
      id: String(user._id),
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      timezone: user.timezone,
      locale: user.locale,
    },
  };
}

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = extractBearerToken(req);
  if (!bearer) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing access token' },
    });
  }

  const result = await loadAuthenticatedUser(bearer);
  if (!result.ok) {
    return res.status(result.status).json({
      error: { code: result.code, message: result.message },
    });
  }

  req.user = result.user;
  return next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const bearer = extractBearerToken(req);
  if (bearer) {
    const result = await loadAuthenticatedUser(bearer);
    if (result.ok) {
      req.user = result.user;
    }
  }
  return next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient role permissions' },
      });
    }
    return next();
  };
}

export function requireSelfOrAdmin(paramName = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }
    if (req.user.role === 'admin') return next();

    const targetId = req.params[paramName];
    if (targetId && req.user.id === targetId) return next();

    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Access denied to another user resource' },
    });
  };
}
