import type {
  CefrLevel,
  GoalType,
  UpsertTeacherProfileInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { User } from '../../users/models/user.model.js';
import { TeacherProfile } from '../models/teacherProfile.model.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listTeachers(
  query: {
    specialty?: GoalType;
    cefr?: CefrLevel;
    q?: string;
    page?: number;
    limit?: number;
  },
  viewerRole?: UserRole,
) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

  const userFilter: Record<string, unknown> = { role: 'teacher', status: 'active' };
  if (query.q && query.q.trim()) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    userFilter.$or = [{ fullName: pattern }, { email: pattern }];
  }

  const users = await User.find(userFilter).select('email fullName avatarUrl timezone').lean();
  const userIds = users.map((u) => u._id);
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const filter: Record<string, unknown> = { userId: { $in: userIds } };
  if (query.specialty) filter.specialties = query.specialty;
  if (query.cefr) filter.cefrLevels = query.cefr;

  const [profiles, total] = await Promise.all([
    TeacherProfile.find(filter)
      .sort({ ratingAvg: -1, qualityScore: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TeacherProfile.countDocuments(filter),
  ]);

  return {
    items: profiles.map((p) => {
      const uid = String(p.userId);
      const u = userMap.get(uid);
      return {
        id: String(p._id),
        userId: uid,
        fullName: u?.fullName ?? '',
        avatarUrl: u?.avatarUrl,
        bio: p.bio,
        certifications: p.certifications,
        specialties: p.specialties,
        cefrLevels: p.cefrLevels,
        languages: p.languages,
        introVideoUrl: p.introVideoUrl,
        timezone: p.timezone,
        weeklyAvailability: p.weeklyAvailability,
        ratingAvg: p.ratingAvg,
        reviewsCount: p.reviewsCount,
        ...(viewerRole === 'admin' ? { payPerSessionVnd: p.payPerSessionVnd, maxStudents: p.maxStudents } : {}),
      };
    }),
    meta: { page, limit, total },
  };
}

export async function getTeacherProfile(
  teacherUserId: string,
  viewer?: { id: string; role: UserRole },
) {
  const user = await User.findById(teacherUserId).select('email fullName avatarUrl timezone role status').lean();
  if (!user || user.role !== 'teacher') {
    throw new AppError(404, 'NOT_FOUND', 'Teacher not found');
  }

  let profile = await TeacherProfile.findOne({ userId: teacherUserId }).lean();
  if (!profile) {
    await TeacherProfile.create({ userId: teacherUserId, timezone: user.timezone });
    profile = await TeacherProfile.findOne({ userId: teacherUserId }).lean();
  }
  if (!profile) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to initialize teacher profile');
  }

  const canSeeComp = viewer?.role === 'admin' || viewer?.id === teacherUserId;
  return {
    id: String(profile._id),
    userId: teacherUserId,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    bio: profile.bio,
    certifications: profile.certifications,
    specialties: profile.specialties,
    cefrLevels: profile.cefrLevels,
    languages: profile.languages,
    introVideoUrl: profile.introVideoUrl,
    timezone: profile.timezone,
    weeklyAvailability: profile.weeklyAvailability,
    exceptions: profile.exceptions,
    ratingAvg: profile.ratingAvg,
    reviewsCount: profile.reviewsCount,
    ...(canSeeComp
      ? {
          payPerSessionVnd: profile.payPerSessionVnd,
          maxStudents: profile.maxStudents,
          qualityScore: profile.qualityScore,
        }
      : {}),
  };
}

export async function upsertTeacherProfile(
  teacherUserId: string,
  input: UpsertTeacherProfileInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role !== 'admin' && actor.id !== teacherUserId) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot edit another teacher profile');
  }

  if (actor.role !== 'admin' && (input.payPerSessionVnd !== undefined || input.maxStudents !== undefined)) {
    throw new AppError(403, 'FORBIDDEN', 'Only admins can update pay rate or student cap');
  }

  const user = await User.findById(teacherUserId).select('role timezone').lean();
  if (!user || user.role !== 'teacher') {
    throw new AppError(404, 'NOT_FOUND', 'Teacher account not found');
  }

  const existing = await TeacherProfile.findOne({ userId: teacherUserId });
  const target =
    existing ?? (await TeacherProfile.create({ userId: teacherUserId, timezone: user.timezone }));

  if (input.bio !== undefined) target.bio = input.bio;
  if (input.certifications !== undefined) target.certifications = input.certifications;
  if (input.specialties !== undefined) target.specialties = input.specialties;
  if (input.cefrLevels !== undefined) target.cefrLevels = input.cefrLevels;
  if (input.languages !== undefined) target.languages = input.languages;
  if (input.introVideoUrl !== undefined) target.introVideoUrl = input.introVideoUrl;
  if (input.payPerSessionVnd !== undefined) target.payPerSessionVnd = input.payPerSessionVnd;
  if (input.maxStudents !== undefined) target.maxStudents = input.maxStudents;
  if (input.timezone !== undefined) target.timezone = input.timezone;
  if (input.weeklyAvailability !== undefined) target.weeklyAvailability = input.weeklyAvailability;
  if (input.exceptions !== undefined) target.exceptions = input.exceptions;

  await target.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'teacher.profile_updated',
    entity: 'TeacherProfile',
    entityId: teacherUserId,
    after: {
      timezone: target.timezone,
      weeklyRuleCount: target.weeklyAvailability.length,
    },
    ip: actor.ip,
  });

  return getTeacherProfile(teacherUserId, { id: actor.id, role: actor.role });
}
