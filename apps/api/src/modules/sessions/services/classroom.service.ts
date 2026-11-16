import { randomUUID } from 'crypto';
import type {
  CreateQuickNoteInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import { Session, type ISession } from '../models/session.model.js';
import { assertSessionAccess } from './session.service.js';

export function assertTwoParticipantClassroomAccess(
  doc: Pick<ISession, 'studentId' | 'teacherId'>,
  actor: { id: string; role: UserRole },
): 'student' | 'teacher' {
  if (actor.role === 'student' && String(doc.studentId) === actor.id) {
    return 'student';
  }
  if (actor.role === 'teacher' && String(doc.teacherId) === actor.id) {
    return 'teacher';
  }
  throw new AppError(
    403,
    'FORBIDDEN',
    'Classroom is restricted strictly to the assigned teacher and student',
  );
}

export async function assertClassroomOpenWindow(doc: Pick<ISession, 'startAt' | 'endAt' | 'status'>) {
  if (doc.status !== 'scheduled' && doc.status !== 'in_progress') {
    throw new AppError(409, 'CLASSROOM_INACTIVE', 'Classroom is only open for scheduled or active sessions');
  }
  const policies = await getBookingPolicies();
  const now = Date.now();
  const openAt = doc.startAt.getTime() - policies.roomOpenBeforeMinutes * 60_000;
  const closeAt = doc.endAt.getTime() + policies.roomCloseAfterMinutes * 60_000;

  if (now < openAt || now > closeAt) {
    throw new AppError(
      403,
      'CLASSROOM_CLOSED',
      `Classroom is open from T-${policies.roomOpenBeforeMinutes}m until end+${policies.roomCloseAfterMinutes}m`,
    );
  }
}

export async function joinClassroom(
  sessionId: string,
  actor: { id: string; role: UserRole },
) {
  const doc = await Session.findById(sessionId);
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }

  const participantRole = assertTwoParticipantClassroomAccess(doc, actor);
  await assertClassroomOpenWindow(doc);

  const now = new Date();
  if (participantRole === 'teacher' && !doc.teacherJoinedAt) {
    doc.teacherJoinedAt = now;
  }
  if (participantRole === 'student' && !doc.studentJoinedAt) {
    doc.studentJoinedAt = now;
  }
  if (doc.teacherJoinedAt && doc.studentJoinedAt && doc.status === 'scheduled') {
    doc.status = 'in_progress';
    doc.startedAt = doc.startedAt ?? now;
  }

  doc.joinLogs.push({
    userId: actor.id as unknown as typeof doc.studentId,
    role: participantRole,
    action: 'join',
    at: now,
  });

  await doc.save();

  return {
    sessionId: String(doc._id),
    title: doc.title,
    status: doc.status,
    meetingProvider: doc.meetingProvider,
    roomCode: doc.roomCode,
    joinUrl: doc.joinUrl,
    startAt: doc.startAt,
    endAt: doc.endAt,
    teacherJoinedAt: doc.teacherJoinedAt,
    studentJoinedAt: doc.studentJoinedAt,
    sharedNotes: doc.sharedNotes,
    quickNotes: doc.quickNotes,
    chatMessages: doc.chatMessages,
  };
}

export async function recordClassroomLeave(
  sessionId: string,
  actor: { id: string; role: UserRole },
): Promise<void> {
  if (actor.role !== 'student' && actor.role !== 'teacher') return;
  await Session.updateOne(
    {
      _id: sessionId,
      $or: [{ studentId: actor.id }, { teacherId: actor.id }],
    },
    {
      $push: {
        joinLogs: {
          userId: actor.id,
          role: actor.role,
          action: 'leave',
          at: new Date(),
        },
      },
    },
  );
}

export async function startSession(
  sessionId: string,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role !== 'teacher' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only assigned teacher or admin can start the session');
  }

  const doc = await Session.findById(sessionId);
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(doc, actor);

  if (doc.status === 'in_progress') {
    return { id: String(doc._id), status: doc.status, startedAt: doc.startedAt };
  }
  if (doc.status !== 'scheduled') {
    throw new AppError(409, 'INVALID_STATE', 'Only scheduled sessions can be started');
  }

  if (actor.role === 'teacher') {
    await assertClassroomOpenWindow(doc);
  }

  const now = new Date();
  doc.status = 'in_progress';
  doc.startedAt = now;
  if (actor.role === 'teacher' && !doc.teacherJoinedAt) {
    doc.teacherJoinedAt = now;
  }
  await doc.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'session.started',
    entity: 'Session',
    entityId: String(doc._id),
    after: { startedAt: now },
    ip: actor.ip,
  });

  return { id: String(doc._id), status: doc.status, startedAt: doc.startedAt };
}

export async function endSession(
  sessionId: string,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role !== 'teacher' && actor.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Only assigned teacher or admin can complete the session');
  }

  const doc = await Session.findById(sessionId);
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(doc, actor);

  if (doc.status !== 'in_progress' && doc.status !== 'scheduled') {
    throw new AppError(409, 'INVALID_STATE', 'Session is already finalized or cancelled');
  }

  const now = new Date();
  const bothJoined = Boolean(doc.teacherJoinedAt && doc.studentJoinedAt);
  if (actor.role === 'teacher' && !bothJoined && doc.status !== 'in_progress') {
    throw new AppError(
      400,
      'ATTENDANCE_INCOMPLETE',
      'Both participants must join or session must be in progress before completing',
    );
  }

  doc.status = 'completed';
  doc.isActive = false;
  doc.endedAt = now;
  await doc.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'session.completed',
    entity: 'Session',
    entityId: String(doc._id),
    after: { endedAt: now, bothJoined },
    ip: actor.ip,
  });

  return { id: String(doc._id), status: doc.status, endedAt: doc.endedAt };
}

export async function updateClassroomSharedNotes(
  sessionId: string,
  content: string,
  actor: { id: string; role: UserRole },
) {
  const doc = await Session.findById(sessionId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  assertTwoParticipantClassroomAccess(doc, actor);
  await assertClassroomOpenWindow(doc);

  doc.sharedNotes = content;
  await doc.save();
  return { sessionId: String(doc._id), sharedNotes: doc.sharedNotes };
}

export async function addClassroomQuickNote(
  sessionId: string,
  input: CreateQuickNoteInput,
  actor: { id: string; role: UserRole },
) {
  const doc = await Session.findById(sessionId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  assertTwoParticipantClassroomAccess(doc, actor);
  await assertClassroomOpenWindow(doc);

  const note = {
    id: randomUUID().slice(0, 10),
    kind: input.kind,
    term: input.term,
    correction: input.correction,
    contextNote: input.contextNote,
    createdBy: actor.id as unknown as typeof doc.studentId,
    createdAt: new Date(),
  };
  doc.quickNotes.push(note);
  await doc.save();
  return note;
}

export async function addClassroomChatMessage(
  sessionId: string,
  text: string,
  actor: { id: string; role: UserRole; fullName: string },
) {
  const doc = await Session.findById(sessionId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  const participantRole = assertTwoParticipantClassroomAccess(doc, actor);
  await assertClassroomOpenWindow(doc);

  const msg = {
    id: randomUUID().slice(0, 10),
    senderId: actor.id as unknown as typeof doc.studentId,
    senderName: actor.fullName,
    senderRole: participantRole,
    text,
    sentAt: new Date(),
  };
  doc.chatMessages.push(msg);
  await doc.save();
  return msg;
}
