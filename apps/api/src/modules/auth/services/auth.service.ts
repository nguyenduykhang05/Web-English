import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { RegisterBodyInput } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { env } from '../../../config/env.js';
import { User, type IUser } from '../../users/models/user.model.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import { AuthActionToken, type AuthActionTokenKind } from '../models/authActionToken.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../mail/mailer.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(user: { _id: unknown; role: IUser['role'] }): string {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, options);
}

function signRefreshToken(userId: string, familyId: string): string {
  const options: jwt.SignOptions = {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  };
  return jwt.sign(
    { sub: userId, family: familyId, jti: randomUUID() },
    env.JWT_REFRESH_SECRET,
    options,
  );
}

export async function createActionToken(
  userId: IUser['_id'],
  kind: AuthActionTokenKind,
  ttlMs: number,
): Promise<string> {
  await AuthActionToken.updateMany(
    { userId, kind, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );
  const rawToken = randomBytes(32).toString('hex');
  await AuthActionToken.create({
    userId,
    kind,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return rawToken;
}

export async function registerUser(data: RegisterBodyInput) {
  const exists = await User.findOne({ email: data.email });
  if (exists) {
    throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');
  }

  // Self-registration is strictly locked to the student role (M1 / anti-escalation)
  const user = await User.create({
    email: data.email,
    passwordHash: data.password,
    fullName: data.fullName,
    phone: data.phone,
    role: 'student',
    status: 'active',
    locale: data.locale ?? 'vi',
    timezone: data.timezone ?? 'Asia/Ho_Chi_Minh',
  });

  const verifyToken = await createActionToken(user._id, 'email_verify', EMAIL_VERIFY_TTL_MS);
  await sendVerificationEmail(user.email, user.fullName, verifyToken);

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.register',
    entity: 'User',
    entityId: String(user._id),
    after: { email: user.email, role: user.role },
  });

  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    timezone: user.timezone,
    locale: user.locale,
    emailVerified: false,
  };
}

export async function loginUser(data: {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}) {
  const user = await User.findOne({ email: data.email });
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
  }

  if (user.status === 'pending') {
    throw new AppError(403, 'ACCOUNT_PENDING', 'Please complete account setup via your invite link');
  }

  if (user.status === 'locked') {
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      user.status = 'active';
      user.failedLoginCount = 0;
      user.lockedUntil = undefined;
    } else {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked due to failed logins');
    }
  }

  const ok = await user.comparePassword(data.password);
  if (!ok) {
    user.failedLoginCount += 1;
    let action = 'auth.login_failed';
    if (user.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      user.status = 'locked';
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      action = 'auth.account_locked';
    }
    await user.save();
    await AuditLog.create({
      actorId: user._id,
      action,
      entity: 'User',
      entityId: String(user._id),
      ip: data.ip,
    });
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
  }

  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const familyId = randomUUID();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(String(user._id), familyId);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    ip: data.ip,
    userAgent: data.userAgent,
  });

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.login',
    entity: 'User',
    entityId: String(user._id),
    ip: data.ip,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      timezone: user.timezone,
      locale: user.locale,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
  };
}

interface RefreshJwtPayload extends jwt.JwtPayload {
  sub?: string;
  family?: string;
}

export async function refreshTokens(oldRefreshToken: string, meta?: { ip?: string; userAgent?: string }) {
  let payload: RefreshJwtPayload;
  try {
    payload = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET) as RefreshJwtPayload;
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
  }

  const incomingHash = hashToken(oldRefreshToken);
  const stored = await RefreshToken.findOne({ tokenHash: incomingHash });
  if (!stored) {
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token not recognized');
  }

  // Reuse detection (SPEC.md A5 M1): revoke all active sessions of that user immediately
  if (stored.revokedAt) {
    await RefreshToken.updateMany(
      { userId: stored.userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    await AuditLog.create({
      actorId: stored.userId,
      action: 'auth.token_reuse_detected',
      entity: 'User',
      entityId: String(stored.userId),
      ip: meta?.ip,
    });
    throw new AppError(401, 'TOKEN_REUSE_DETECTED', 'Refresh token reuse detected; all sessions revoked');
  }

  if (stored.expiresAt < new Date()) {
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token expired');
  }

  stored.revokedAt = new Date();
  await stored.save();

  const user = await User.findById(payload.sub);
  if (!user || user.status === 'locked' || user.status === 'pending') {
    throw new AppError(401, 'UNAUTHORIZED', 'User account cannot refresh session');
  }

  const familyId = payload.family ?? stored.familyId;
  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(String(user._id), familyId);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(newRefreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.token_refresh',
    entity: 'User',
    entityId: String(user._id),
    ip: meta?.ip,
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function verifyEmail(rawToken: string) {
  const tokenDoc = await AuthActionToken.findOne({
    kind: 'email_verify',
    tokenHash: hashToken(rawToken),
    usedAt: { $exists: false },
  });

  if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
    throw new AppError(400, 'INVALID_TOKEN', 'Verification token is invalid or expired');
  }

  const user = await User.findById(tokenDoc.userId);
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  user.emailVerifiedAt = new Date();
  await user.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.email_verified',
    entity: 'User',
    entityId: String(user._id),
  });

  return { verified: true, email: user.email };
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user || user.status === 'pending') {
    return { sent: true };
  }

  const resetToken = await createActionToken(user._id, 'password_reset', PASSWORD_RESET_TTL_MS);
  await sendPasswordResetEmail(user.email, user.fullName, resetToken);

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.password_reset_requested',
    entity: 'User',
    entityId: String(user._id),
  });

  return { sent: true };
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenDoc = await AuthActionToken.findOne({
    kind: 'password_reset',
    tokenHash: hashToken(rawToken),
    usedAt: { $exists: false },
  });

  if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
    throw new AppError(400, 'INVALID_TOKEN', 'Password reset token is invalid or expired');
  }

  const user = await User.findById(tokenDoc.userId);
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  user.passwordHash = newPassword;
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  if (user.status === 'locked') {
    user.status = 'active';
  }
  await user.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.password_reset',
    entity: 'User',
    entityId: String(user._id),
  });

  return { ok: true };
}

export async function acceptTeacherInvite(
  rawToken: string,
  payload: { password: string; fullName?: string },
) {
  const tokenDoc = await AuthActionToken.findOne({
    kind: 'teacher_invite',
    tokenHash: hashToken(rawToken),
    usedAt: { $exists: false },
  });

  if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
    throw new AppError(400, 'INVALID_TOKEN', 'Invite link is invalid or expired');
  }

  const user = await User.findById(tokenDoc.userId);
  if (!user || user.role !== 'teacher') {
    throw new AppError(404, 'NOT_FOUND', 'Invited teacher account not found');
  }

  user.passwordHash = payload.password;
  if (payload.fullName) {
    user.fullName = payload.fullName;
  }
  user.status = 'active';
  user.emailVerifiedAt = new Date();
  await user.save();

  tokenDoc.usedAt = new Date();
  await tokenDoc.save();

  await AuditLog.create({
    actorId: user._id,
    action: 'auth.teacher_invite_accepted',
    entity: 'User',
    entityId: String(user._id),
  });

  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
  };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId).select('-passwordHash').lean();
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    locale: user.locale,
    emailVerified: Boolean(user.emailVerifiedAt),
    lastLoginAt: user.lastLoginAt,
  };
}
