import type {
  CefrLevel,
  CreateHomeworkInput,
  CreateLessonInput,
  GoalType,
  GradeHomeworkInput,
  HomeworkStatus,
  SkillKey,
  SubmitHomeworkInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { applyStudentSkillUpdate } from '../../reports/services/skillMastery.helper.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import {
  assertCanAccessStudentPath,
  proposeAdaptiveMilestoneIfTriggered,
} from '../../learningPaths/services/learningPath.service.js';
import { User } from '../../users/models/user.model.js';
import { Homework, type IHomework } from '../models/homework.model.js';
import { Lesson } from '../models/lesson.model.js';

export async function listLessons(
  query: { goalType?: GoalType; cefrLevel?: CefrLevel; skillFocus?: SkillKey },
  viewerRole?: UserRole,
) {
  const filter: Record<string, unknown> = {};
  if (viewerRole !== 'admin' && viewerRole !== 'teacher') {
    filter.isPublished = true;
  }
  if (query.goalType) filter.goalType = query.goalType;
  if (query.cefrLevel) filter.cefrLevel = query.cefrLevel;
  if (query.skillFocus) filter.skillFocus = query.skillFocus;

  const docs = await Lesson.find(filter).sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    id: String(d._id),
    slug: d.slug,
    title: d.title,
    description: d.description,
    goalType: d.goalType,
    cefrLevel: d.cefrLevel,
    skillFocus: d.skillFocus,
    durationMinutes: d.durationMinutes,
    contentMarkdown: d.contentMarkdown,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    isPublished: d.isPublished,
  }));
}

export async function createLesson(
  input: CreateLessonInput,
  actor: { id: string; ip?: string },
) {
  const created = await Lesson.create({
    ...input,
    createdBy: actor.id,
  });

  await AuditLog.create({
    actorId: actor.id,
    action: 'lesson.created',
    entity: 'Lesson',
    entityId: String(created._id),
    after: { slug: created.slug, cefrLevel: created.cefrLevel },
    ip: actor.ip,
  });

  return {
    id: String(created._id),
    slug: created.slug,
    title: created.title,
    cefrLevel: created.cefrLevel,
    skillFocus: created.skillFocus,
  };
}

function sanitizeHomeworkForViewer(doc: IHomework | (Record<string, unknown> & { _id: unknown }), role: UserRole) {
  const h = doc as unknown as IHomework & { createdAt?: Date };
  const hideAnswers = role === 'student' && h.status !== 'graded';
  return {
    id: String(h._id),
    studentId: String(h.studentId),
    teacherId: String(h.teacherId),
    sessionId: h.sessionId ? String(h.sessionId) : undefined,
    lessonId: h.lessonId ? String(h.lessonId) : undefined,
    title: h.title,
    homeworkType: h.homeworkType,
    skillFocus: h.skillFocus,
    prompt: h.prompt,
    questions: h.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      pairs: q.pairs,
      maxPoints: q.maxPoints,
      ...(hideAnswers ? {} : { correctAnswer: q.correctAnswer }),
    })),
    maxScore: h.maxScore,
    status: h.status,
    proposedStatus: h.proposedStatus,
    dueAt: h.dueAt,
    submittedNote: h.submittedNote,
    audioUrl: h.audioUrl,
    submittedAnswers: h.submittedAnswers,
    autoSuggestedScore: h.autoSuggestedScore,
    submittedAt: h.submittedAt,
    score: h.score,
    teacherFeedback: h.teacherFeedback,
    gradedAt: h.gradedAt,
  };
}

export async function createHomework(
  input: CreateHomeworkInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot assign homework');
  }
  const student = await User.findOne({ _id: input.studentId, role: 'student' }).select('_id').lean();
  if (!student) {
    throw new AppError(404, 'NOT_FOUND', 'Student account not found');
  }
  await assertCanAccessStudentPath(input.studentId, actor);

  const hw = await Homework.create({
    studentId: input.studentId,
    teacherId: actor.id,
    sessionId: input.sessionId,
    lessonId: input.lessonId,
    title: input.title,
    homeworkType: input.homeworkType,
    skillFocus: input.skillFocus,
    prompt: input.prompt,
    questions: input.questions,
    maxScore: input.maxScore,
    status: 'assigned',
    proposedStatus: input.isProposed ? 'proposed' : 'approved',
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
  });

  await AuditLog.create({
    actorId: actor.id,
    action: 'homework.created',
    entity: 'Homework',
    entityId: String(hw._id),
    after: { studentId: input.studentId, homeworkType: input.homeworkType, status: hw.status },
    ip: actor.ip,
  });

  if (!input.isProposed) {
    await notifyUser({
      userId: input.studentId,
      type: 'system',
      title: `Bài tập mới: ${input.title}`,
      body: `Giáo viên đã giao bài tập luyện kỹ năng ${input.skillFocus}.`,
      dedupeKey: `hw_assigned:${String(hw._id)}`,
      referenceType: 'Homework',
      referenceId: String(hw._id),
    });
  }

  return sanitizeHomeworkForViewer(hw, actor.role);
}

export async function listHomeworkForActor(
  actor: { id: string; role: UserRole },
  query: { studentId?: string; status?: HomeworkStatus },
) {
  const filter: Record<string, unknown> = {};
  if (actor.role === 'student') {
    filter.studentId = actor.id;
    filter.proposedStatus = 'approved';
  } else if (actor.role === 'teacher') {
    filter.teacherId = actor.id;
    if (query.studentId) filter.studentId = query.studentId;
  } else if (query.studentId) {
    filter.studentId = query.studentId;
  }
  if (query.status) filter.status = query.status;

  const docs = await Homework.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return docs.map((d) => sanitizeHomeworkForViewer(d, actor.role));
}

export async function submitHomework(
  homeworkId: string,
  input: SubmitHomeworkInput,
  actor: { id: string; role: UserRole },
) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Only students can submit homework answers');
  }

  const hw = await Homework.findById(homeworkId);
  if (!hw) throw new AppError(404, 'NOT_FOUND', 'Homework not found');
  if (String(hw.studentId) !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot submit another student homework');
  }
  if (hw.status === 'graded') {
    throw new AppError(409, 'ALREADY_GRADED', 'Homework has already been graded');
  }

  // Compute objective auto-suggested score if questions carry correct answers
  let totalPoints = 0;
  let earnedPoints = 0;
  for (const q of hw.questions) {
    if (!q.correctAnswer) continue;
    totalPoints += q.maxPoints;
    const submitted = input.answers.find((a) => a.questionId === q.id);
    if (
      submitted &&
      submitted.answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()
    ) {
      earnedPoints += q.maxPoints;
    }
  }
  const autoSuggestedScore =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * hw.maxScore) : undefined;

  hw.submittedNote = input.note;
  hw.audioUrl = input.audioUrl;
  hw.submittedAnswers = input.answers;
  hw.autoSuggestedScore = autoSuggestedScore;
  hw.status = 'submitted';
  hw.submittedAt = new Date();
  await hw.save();

  await notifyUser({
    userId: String(hw.teacherId),
    type: 'system',
    title: `Học viên đã nộp bài: ${hw.title}`,
    body: 'Vui lòng kiểm tra và chấm điểm bài tập của học viên.',
    dedupeKey: `hw_submitted:${String(hw._id)}`,
    referenceType: 'Homework',
    referenceId: String(hw._id),
  });

  return sanitizeHomeworkForViewer(hw, actor.role);
}

export async function gradeHomework(
  homeworkId: string,
  input: GradeHomeworkInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot grade homework');
  }

  const hw = await Homework.findById(homeworkId);
  if (!hw) throw new AppError(404, 'NOT_FOUND', 'Homework not found');
  if (actor.role === 'teacher' && String(hw.teacherId) !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Only the assigning teacher or admin can grade this homework');
  }
  if (hw.status === 'assigned') {
    throw new AppError(409, 'NOT_SUBMITTED', 'Student has not submitted homework yet');
  }

  const policies = await getBookingPolicies();
  hw.score = Math.min(hw.maxScore, input.score);
  hw.teacherFeedback = input.teacherFeedback;
  hw.status = 'graded';
  hw.gradedBy = actor.id as unknown as typeof hw.gradedBy;
  hw.gradedAt = new Date();
  await hw.save();

  const normalized100 = Math.round((hw.score / Math.max(1, hw.maxScore)) * 100);
  const progressUpdate = await applyStudentSkillUpdate({
    studentId: String(hw.studentId),
    ratings: { [hw.skillFocus]: normalized100 },
    alpha: policies.skillEmaAlpha,
    source: 'manual',
    mode: 'ema',
  });

  const proposedNewMilestone = await proposeAdaptiveMilestoneIfTriggered(String(hw.studentId), {
    skillFocus: hw.skillFocus,
    score: normalized100,
  });

  await AuditLog.create({
    actorId: actor.id,
    action: 'homework.graded',
    entity: 'Homework',
    entityId: String(hw._id),
    after: { score: hw.score, skillFocus: hw.skillFocus, proposedNewMilestone },
    ip: actor.ip,
  });

  await notifyUser({
    userId: String(hw.studentId),
    type: 'system',
    title: `Đã chấm bài tập: ${hw.title} (${hw.score}/${hw.maxScore})`,
    body: input.teacherFeedback,
    dedupeKey: `hw_graded:${String(hw._id)}`,
    referenceType: 'Homework',
    referenceId: String(hw._id),
  });

  return {
    homework: sanitizeHomeworkForViewer(hw, actor.role),
    progressUpdate,
    proposedNewMilestone,
  };
}
