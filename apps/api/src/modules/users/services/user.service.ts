import { randomBytes } from 'crypto';
import type {
  InviteTeacherBodyInput,
  UpdateProfileBodyInput,
  UserRole,
  UserStatus,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { createActionToken } from '../../auth/services/auth.service.js';
import { sendTeacherInviteEmail } from '../../mail/mailer.js';
import { User } from '../models/user.model.js';

const TEACHER_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function getUserById(id: string) {
  const user = await User.findById(id).select('-passwordHash').lean();
  if (!user) return null;
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
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function listUsers(query: {
  role?: UserRole;
  status?: UserStatus;
  q?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.q && query.q.trim()) {
    const safePattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter.$or = [{ email: safePattern }, { fullName: safePattern }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: items.map((u) => ({
      id: String(u._id),
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      timezone: u.timezone,
      locale: u.locale,
      emailVerified: Boolean(u.emailVerifiedAt),
    })),
    meta: { page, limit, total },
  };
}

export async function inviteTeacher(
  input: InviteTeacherBodyInput,
  actor: { id: string; ip?: string },
) {
  const exists = await User.findOne({ email: input.email });
  if (exists) {
    throw new AppError(409, 'EMAIL_EXISTS', 'User with this email already exists');
  }

  const temporaryPassword = randomBytes(32).toString('hex');
  const teacher = await User.create({
    email: input.email,
    passwordHash: temporaryPassword,
    fullName: input.fullName,
    role: 'teacher',
    status: 'pending',
    timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
    locale: input.locale ?? 'vi',
  });

  const inviteToken = await createActionToken(
    teacher._id,
    'teacher_invite',
    TEACHER_INVITE_TTL_MS,
  );
  await sendTeacherInviteEmail(teacher.email, teacher.fullName, inviteToken);

  await AuditLog.create({
    actorId: actor.id,
    action: 'user.invite_teacher',
    entity: 'User',
    entityId: String(teacher._id),
    after: { email: teacher.email, role: teacher.role, status: teacher.status },
    ip: actor.ip,
  });

  return {
    id: String(teacher._id),
    email: teacher.email,
    fullName: teacher.fullName,
    role: teacher.role,
    status: teacher.status,
    inviteExpiresInHours: 72,
  };
}

export async function updateUserProfile(
  id: string,
  data: UpdateProfileBodyInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const existing = await User.findById(id).select('-passwordHash').lean();
  if (!existing) return null;

  const updateFields: Partial<{
    fullName: string;
    phone: string;
    avatarUrl: string;
    timezone: string;
    locale: string;
    status: UserStatus;
  }> = {};

  if (data.fullName !== undefined) updateFields.fullName = data.fullName;
  if (data.phone !== undefined) updateFields.phone = data.phone;
  if (data.avatarUrl !== undefined) updateFields.avatarUrl = data.avatarUrl;
  if (data.timezone !== undefined) updateFields.timezone = data.timezone;
  if (data.locale !== undefined) updateFields.locale = data.locale;

  if (data.status !== undefined) {
    if (actor.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Only admins can modify account status');
    }
    updateFields.status = data.status;
  }

  const updated = await User.findByIdAndUpdate(id, updateFields, { new: true })
    .select('-passwordHash')
    .lean();
  if (!updated) return null;

  await AuditLog.create({
    actorId: actor.id,
    action: 'user.profile_updated',
    entity: 'User',
    entityId: id,
    before: {
      fullName: existing.fullName,
      timezone: existing.timezone,
      locale: existing.locale,
      status: existing.status,
    },
    after: updateFields,
    ip: actor.ip,
  });

  return {
    id: String(updated._id),
    email: updated.email,
    fullName: updated.fullName,
    role: updated.role,
    status: updated.status,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    timezone: updated.timezone,
    locale: updated.locale,
  };
}

export async function unlockUserAccount(
  id: string,
  actor: { id: string; ip?: string },
) {
  const updated = await User.findByIdAndUpdate(
    id,
    {
      $set: { status: 'active', failedLoginCount: 0 },
      $unset: { lockedUntil: '' },
    },
    { new: true },
  )
    .select('-passwordHash')
    .lean();

  if (!updated) return null;

  await AuditLog.create({
    actorId: actor.id,
    action: 'user.unlocked',
    entity: 'User',
    entityId: id,
    ip: actor.ip,
  });

  return {
    id: String(updated._id),
    email: updated.email,
    status: updated.status,
  };
}
