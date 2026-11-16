import type {
  CefrLevel,
  GoalType,
  StudentLifecycle,
  UpdateStudentProfileInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { getStudentBalance } from '../../ledger/services/ledger.service.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { buildCsvDocument } from '../../../utils/csv.js';
import { User } from '../../users/models/user.model.js';
import { StudentProfile, type IStudentProfile } from '../models/studentProfile.model.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function assertCanAccessStudent(
  studentUserId: string,
  actor: { id: string; role: UserRole },
) {
  if (actor.role === 'admin') return;
  if (actor.role === 'student' && actor.id === studentUserId) return;
  if (actor.role === 'teacher') {
    const assigned = await Enrollment.exists({
      studentId: studentUserId,
      teacherId: actor.id,
      status: { $in: ['active', 'paused', 'completed'] },
    });
    if (assigned) return;
  }
  throw new AppError(403, 'FORBIDDEN', 'Access denied to this student profile');
}

type StudentProfileShape = Pick<
  IStudentProfile,
  | '_id'
  | 'userId'
  | 'occupation'
  | 'isMinor'
  | 'guardian'
  | 'goal'
  | 'currentCefr'
  | 'skillScores'
  | 'favoriteTopics'
  | 'preferredSlots'
  | 'weaknesses'
  | 'lifecycleStatus'
  | 'leadSource'
  | 'consents'
  | 'internalNotes'
>;

function formatStudentProfile(
  profile: StudentProfileShape,
  viewerRole: UserRole,
  remainingSessions: number,
  user?: { email: string; fullName: string; phone?: string; timezone: string; locale: string } | null,
) {
  const base = {
    id: String(profile._id),
    userId: String(profile.userId),
    user: user ?? undefined,
    occupation: profile.occupation,
    isMinor: profile.isMinor,
    guardian: profile.guardian,
    goal: profile.goal,
    currentCefr: profile.currentCefr,
    skillScores: profile.skillScores,
    favoriteTopics: profile.favoriteTopics,
    preferredSlots: profile.preferredSlots,
    weaknesses: profile.weaknesses,
    lifecycleStatus: profile.lifecycleStatus,
    leadSource: profile.leadSource,
    consents: profile.consents,
    remainingSessions,
  };

  if (viewerRole === 'student') {
    return base;
  }
  return {
    ...base,
    internalNotes: profile.internalNotes,
  };
}

export async function getStudentProfile(
  studentUserId: string,
  actor: { id: string; role: UserRole },
) {
  await assertCanAccessStudent(studentUserId, actor);

  const user = await User.findById(studentUserId).select('email fullName phone timezone locale role').lean();
  if (!user || user.role !== 'student') {
    throw new AppError(404, 'NOT_FOUND', 'Student not found');
  }

  let profile = await StudentProfile.findOne({ userId: studentUserId }).lean();
  if (!profile) {
    await StudentProfile.create({ userId: studentUserId });
    profile = await StudentProfile.findOne({ userId: studentUserId }).lean();
  }
  if (!profile) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to initialize student profile');
  }

  const remainingSessions = await getStudentBalance(studentUserId);
  return formatStudentProfile(profile, actor.role, remainingSessions, {
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    timezone: user.timezone,
    locale: user.locale,
  });
}

export async function updateStudentProfile(
  studentUserId: string,
  input: UpdateStudentProfileInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  await assertCanAccessStudent(studentUserId, actor);

  if (actor.role === 'student' && (input.lifecycleStatus !== undefined || input.internalNotes !== undefined)) {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot edit lifecycle status or internal notes');
  }

  const user = await User.findById(studentUserId).select('email fullName phone timezone locale role').lean();
  if (!user || user.role !== 'student') {
    throw new AppError(404, 'NOT_FOUND', 'Student not found');
  }

  let existing = await StudentProfile.findOne({ userId: studentUserId });
  if (!existing) {
    existing = await StudentProfile.create({ userId: studentUserId });
  }

  const before = {
    currentCefr: existing.currentCefr,
    lifecycleStatus: existing.lifecycleStatus,
    goalType: existing.goal?.goalType,
  };

  if (input.occupation !== undefined) existing.occupation = input.occupation;
  if (input.isMinor !== undefined) existing.isMinor = input.isMinor;
  if (input.guardian !== undefined) existing.guardian = input.guardian;
  if (input.goal !== undefined) {
    existing.goal = {
      goalType: input.goal.goalType,
      targetScore: input.goal.targetScore,
      deadline: input.goal.deadline ? new Date(input.goal.deadline) : undefined,
      description: input.goal.description,
    };
  }
  if (input.currentCefr !== undefined) existing.currentCefr = input.currentCefr;
  if (input.skillScores !== undefined) {
    existing.skillScores = { ...existing.skillScores, ...input.skillScores };
  }
  if (input.favoriteTopics !== undefined) existing.favoriteTopics = input.favoriteTopics;
  if (input.preferredSlots !== undefined) existing.preferredSlots = input.preferredSlots;
  if (input.weaknesses !== undefined) existing.weaknesses = input.weaknesses;
  if (input.lifecycleStatus !== undefined) existing.lifecycleStatus = input.lifecycleStatus;
  if (input.leadSource !== undefined) existing.leadSource = input.leadSource;
  if (input.internalNotes !== undefined) existing.internalNotes = input.internalNotes;
  if (input.consents !== undefined) {
    existing.consents = {
      dataPrivacyAccepted: input.consents.dataPrivacyAccepted,
      aiProcessingAccepted: input.consents.aiProcessingAccepted,
      acceptedAt: new Date(),
    };
  }

  await existing.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'student.profile_updated',
    entity: 'StudentProfile',
    entityId: studentUserId,
    before,
    after: {
      currentCefr: existing.currentCefr,
      lifecycleStatus: existing.lifecycleStatus,
      goalType: existing.goal?.goalType,
    },
    ip: actor.ip,
  });

  const remainingSessions = await getStudentBalance(studentUserId);
  return formatStudentProfile(existing.toObject(), actor.role, remainingSessions, {
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    timezone: user.timezone,
    locale: user.locale,
  });
}

export async function listStudents(
  query: {
    lifecycleStatus?: StudentLifecycle;
    currentCefr?: CefrLevel;
    goalType?: GoalType;
    q?: string;
    page?: number;
    limit?: number;
  },
  actor: { id: string; role: UserRole },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot list all student profiles');
  }

  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

  const userFilter: Record<string, unknown> = { role: 'student' };
  if (actor.role === 'teacher') {
    const teacherEnrollments = await Enrollment.find({
      teacherId: actor.id,
      status: { $in: ['active', 'paused', 'completed'] },
    })
      .select('studentId')
      .lean();
    const assignedIds = [...new Set(teacherEnrollments.map((e) => e.studentId))];
    userFilter._id = { $in: assignedIds };
  }

  if (query.q && query.q.trim()) {
    const pattern = new RegExp(escapeRegex(query.q.trim()), 'i');
    userFilter.$or = [{ fullName: pattern }, { email: pattern }];
  }

  const matchedUsers = await User.find(userFilter).select('email fullName timezone locale').lean();
  const matchedUserIds = matchedUsers.map((u) => u._id);
  const userMap = new Map(matchedUsers.map((u) => [String(u._id), u]));

  const profileFilter: Record<string, unknown> = { userId: { $in: matchedUserIds } };
  if (query.lifecycleStatus) profileFilter.lifecycleStatus = query.lifecycleStatus;
  if (query.currentCefr) profileFilter.currentCefr = query.currentCefr;
  if (query.goalType) profileFilter['goal.goalType'] = query.goalType;

  const [profiles, total] = await Promise.all([
    StudentProfile.find(profileFilter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StudentProfile.countDocuments(profileFilter),
  ]);

  const items = await Promise.all(
    profiles.map(async (p) => {
      const uid = String(p.userId);
      const balance = await getStudentBalance(uid);
      const u = userMap.get(uid);
      return formatStudentProfile(
        p,
        actor.role,
        balance,
        u
          ? {
              email: u.email,
              fullName: u.fullName,
              timezone: u.timezone,
              locale: u.locale,
            }
          : null,
      );
    }),
  );

  return { items, meta: { page, limit, total } };
}

export async function getStudentTimeline(
  studentUserId: string,
  actor: { id: string; role: UserRole },
) {
  await assertCanAccessStudent(studentUserId, actor);

  const [audits, ledger, enrollments] = await Promise.all([
    AuditLog.find({ entityId: studentUserId }).sort({ createdAt: -1 }).limit(30).lean(),
    SessionLedger.find({ studentId: studentUserId }).sort({ createdAt: -1 }).limit(30).lean(),
    Enrollment.find({ studentId: studentUserId }).sort({ createdAt: -1 }).limit(15).lean(),
  ]);

  return {
    audits: audits.map((a) => ({
      id: String(a._id),
      action: a.action,
      entity: a.entity,
      after: a.after,
    })),
    ledger: ledger.map((l) => ({
      id: String(l._id),
      type: l.type,
      delta: l.delta,
      reason: l.reason,
    })),
    enrollments: enrollments.map((e) => ({
      id: String(e._id),
      status: e.status,
      purchasedSessions: e.purchasedSessions,
      activatedAt: e.activatedAt,
    })),
  };
}

export async function exportStudentsCsv(actor: { id: string; role: UserRole }): Promise<string> {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only admins can export student directory');
  }
  const res = await listStudents({ page: 1, limit: 500 }, actor);
  const header = ['StudentId', 'FullName', 'Email', 'CEFR', 'Goal', 'Lifecycle', 'RemainingSessions'];
  const rows = res.items.map((item) => [
    item.userId,
    item.user?.fullName ?? '',
    item.user?.email ?? '',
    item.currentCefr,
    item.goal?.goalType ?? '',
    item.lifecycleStatus,
    item.remainingSessions,
  ]);

  return buildCsvDocument(header, rows);
}
