import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../middleware/errorHandler.js';
import { env } from '../../../config/env.js';
import {
  acceptInviteBodySchema,
  forgotBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetBodySchema,
  verifyEmailBodySchema,
} from '../schemas/auth.schema.js';
import {
  acceptTeacherInvite,
  forgotPassword,
  getMe,
  loginUser,
  logoutUser,
  refreshTokens,
  registerUser,
  resetPassword,
  verifyEmail,
} from '../services/auth.service.js';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export async function registerController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerBodySchema.parse(req.body);
    const data = await registerUser(input);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginBodySchema.parse(req.body);
    const result = await loginUser({
      ...input,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ data: { accessToken: result.accessToken, user: result.user } });
  } catch (err) {
    next(err);
  }
}

export async function refreshController(req: Request, res: Response, next: NextFunction) {
  try {
    const token = typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : undefined;
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing refresh token cookie');
    }
    const result = await refreshTokens(token, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ data: { accessToken: result.accessToken } });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req: Request, res: Response, next: NextFunction) {
  try {
    const token = typeof req.cookies?.refreshToken === 'string' ? req.cookies.refreshToken : undefined;
    await logoutUser(token);
    res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = verifyEmailBodySchema.parse(req.body);
    const data = await verifyEmail(input.token);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function forgotPasswordController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = forgotBodySchema.parse(req.body);
    const data = await forgotPassword(input.email);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = resetBodySchema.parse(req.body);
    const data = await resetPassword(input.token, input.password);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function acceptInviteController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = acceptInviteBodySchema.parse(req.body);
    const data = await acceptTeacherInvite(input.token, {
      password: input.password,
      fullName: input.fullName,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function meController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    const data = await getMe(req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
