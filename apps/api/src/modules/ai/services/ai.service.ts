import { randomUUID } from 'crypto';
import type {
  AIFeature,
  AiExerciseGenRequest,
  AiSpeakingRequest,
  AiWritingRequest,
  DecideAiProposalInput,
  SkillScores,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Homework } from '../../curriculum/models/homework.model.js';
import { matchTeachersForStudent } from '../../enrollments/services/matching.service.js';
import { Assessment } from '../../learningPaths/models/assessment.model.js';
import { LearningPath } from '../../learningPaths/models/learningPath.model.js';
import { assertCanAccessStudentPath } from '../../learningPaths/services/learningPath.service.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { ALL_SKILL_KEYS } from '../../reports/services/skillMastery.helper.js';
import { Session } from '../../sessions/models/session.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { getAIProvider } from '../ai.provider.js';
import {
  hashPrompt,
  redactPiiText,
  verifyConsentAndLoadPiiStrings,
} from '../aiPrivacy.helper.js';
import { AILog } from '../models/aiLog.model.js';

function findWeakestSkill(scores?: SkillScores): keyof SkillScores {
  if (!scores) return 'speaking';
  let weakest: keyof SkillScores = 'speaking';
  let minVal = 101;
  for (const k of ALL_SKILL_KEYS) {
    if ((scores[k] ?? 50) < minVal) {
      minVal = scores[k] ?? 50;
      weakest = k;
    }
  }
  return weakest;
}

async function runAnonymizedAiPipeline(params: {
  feature: AIFeature;
  studentId: string;
  actor: { id: string; role: UserRole };
  rawPrompt: string;
  context: Record<string, unknown>;
  onPersistProposed?: (generated: {
    summary: string;
    structured: Record<string, unknown>;
  }) => Promise<{
    appliedTargetType?: 'LearningPath' | 'Homework' | 'SessionReport' | 'None';
    appliedTargetId?: string;
    appliedSubId?: string;
  }>;
}) {
  await assertCanAccessStudentPath(params.studentId, params.actor);
  const { learnerTag, piiTermsToRedact } = await verifyConsentAndLoadPiiStrings(params.studentId);

  const anonymizedPrompt = redactPiiText(
    `LearnerRef=${learnerTag}\n${params.rawPrompt}`,
    piiTermsToRedact,
  );
  const promptHash = hashPrompt(anonymizedPrompt);

  const t0 = Date.now();
  const provider = getAIProvider();
  const generated = await provider.generateFeature({
    feature: params.feature,
    anonymizedPrompt,
    context: params.context,
  });
  const latencyMs = Math.max(1, Date.now() - t0);

  const linkTarget = params.onPersistProposed
    ? await params.onPersistProposed(generated)
    : { appliedTargetType: 'None' as const };

  const log = await AILog.create({
    feature: params.feature,
    provider: provider.name,
    aiModel: generated.model,
    actorId: params.actor.id,
    studentId: params.studentId,
    promptHash,
    redactedInputPreview: anonymizedPrompt.slice(0, 300),
    status: 'proposed',
    summary: generated.summary,
    result: generated.structured,
    latencyMs,
    tokenEstimate: generated.tokenEstimate,
    consentVerified: true,
    piiRedacted: true,
    appliedTargetType: linkTarget.appliedTargetType,
    appliedTargetId: linkTarget.appliedTargetId,
    appliedSubId: linkTarget.appliedSubId,
  });

  return {
    id: String(log._id),
    feature: log.feature,
    status: log.status,
    provider: log.provider,
    aiModel: log.aiModel,
    summary: log.summary,
    result: log.result,
    consentVerified: log.consentVerified,
    piiRedacted: log.piiRedacted,
    redactedInputPreview: log.redactedInputPreview,
    appliedTargetType: log.appliedTargetType,
    appliedTargetId: log.appliedTargetId,
  };
}

export async function aiAssessWriting(
  input: AiWritingRequest,
  actor: { id: string; role: UserRole },
) {
  const studentId = actor.role !== 'student' && input.studentId ? input.studentId : actor.id;
  return runAnonymizedAiPipeline({
    feature: 'writing_assessment',
    studentId,
    actor,
    rawPrompt: `Target=${input.targetBand ?? 'IELTS 6.5'}\nTask=${input.promptText}\nEssay=${input.essayText}`,
    context: { targetBand: input.targetBand },
  });
}

export async function aiAssessSpeaking(
  input: AiSpeakingRequest,
  actor: { id: string; role: UserRole },
) {
  const studentId = actor.role !== 'student' && input.studentId ? input.studentId : actor.id;
  return runAnonymizedAiPipeline({
    feature: 'speaking_assessment',
    studentId,
    actor,
    rawPrompt: `Target=${input.targetBand ?? 'IELTS 6.5'}\nPrompt=${input.promptText}\nTranscript=${input.transcriptText}`,
    context: { targetBand: input.targetBand },
  });
}

export async function aiExplainPlacement(
  assessmentId: string,
  actor: { id: string; role: UserRole },
) {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new AppError(404, 'NOT_FOUND', 'Assessment not found');
  const studentId = String(assessment.studentId);

  return runAnonymizedAiPipeline({
    feature: 'placement_explanation',
    studentId,
    actor,
    rawPrompt: `PlacementCEFR=${assessment.cefrResult ?? 'B1'} Overall=${assessment.overallScore ?? 50} Answers=${assessment.answers.length}`,
    context: {
      cefrResult: assessment.cefrResult,
      overallScore: assessment.overallScore,
      skillScores: assessment.skillScores,
    },
  });
}

export async function aiProposeLearningPath(
  input: { studentId?: string; focusGoal?: string },
  actor: { id: string; role: UserRole },
) {
  const studentId = actor.role !== 'student' && input.studentId ? input.studentId : actor.id;
  const profile = await StudentProfile.findOne({ userId: studentId }).lean();
  const weakestSkill = findWeakestSkill(profile?.skillScores);

  return runAnonymizedAiPipeline({
    feature: 'path_proposal',
    studentId,
    actor,
    rawPrompt: `CEFR=${profile?.currentCefr ?? 'B1'} Weakest=${weakestSkill} Goal=${input.focusGoal ?? profile?.goal?.goalType ?? 'ielts'}`,
    context: {
      weakestSkill,
      targetCefr: profile?.currentCefr ?? 'B2',
      focusGoal: input.focusGoal ?? profile?.goal?.goalType ?? 'ielts',
    },
    onPersistProposed: async (generated) => {
      const path = await LearningPath.findOne({ studentId }).sort({ createdAt: -1 });
      if (!path) return { appliedTargetType: 'None' };
      const msId = `ai-${randomUUID().slice(0, 6)}`;
      path.milestones.push({
        id: msId,
        title: String(generated.structured.title ?? `AI Proposed: ${weakestSkill}`),
        description: String(generated.structured.description ?? generated.summary),
        cefrTarget: path.targetCefr,
        skillFocus: weakestSkill,
        plannedSessions: Number(generated.structured.plannedSessions ?? 3),
        completedSessions: 0,
        status: 'proposed',
        source: 'ai',
        aiReason: generated.summary,
      });
      await path.save();
      return {
        appliedTargetType: 'LearningPath',
        appliedTargetId: String(path._id),
        appliedSubId: msId,
      };
    },
  });
}

export async function aiGenerateExercise(
  input: AiExerciseGenRequest,
  actor: { id: string; role: UserRole },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Only teachers or admins can generate proposed homework');
  }

  return runAnonymizedAiPipeline({
    feature: 'exercise_generation',
    studentId: input.studentId,
    actor,
    rawPrompt: `Type=${input.homeworkType} Skill=${input.skillFocus} CEFR=${input.cefrLevel} Topic=${input.topic}`,
    context: {
      topic: input.topic,
      skillFocus: input.skillFocus,
      cefrLevel: input.cefrLevel,
      homeworkType: input.homeworkType,
    },
    onPersistProposed: async (generated) => {
      const rawQuestions = Array.isArray(generated.structured.questions)
        ? (generated.structured.questions as {
            id: string;
            type: 'multiple_choice' | 'fill_blank' | 'matching' | 'essay' | 'speaking';
            prompt: string;
            options?: string[];
            correctAnswer?: string;
            maxPoints: number;
          }[])
        : [];
      const hw = await Homework.create({
        studentId: input.studentId,
        teacherId: actor.id,
        title: String(generated.structured.title ?? `AI Exercise: ${input.topic}`),
        homeworkType: input.homeworkType,
        skillFocus: input.skillFocus,
        prompt: String(generated.structured.prompt ?? input.topic),
        questions: rawQuestions,
        maxScore: 100,
        status: 'assigned',
        proposedStatus: 'proposed',
      });
      return {
        appliedTargetType: 'Homework',
        appliedTargetId: String(hw._id),
      };
    },
  });
}

export async function aiSummarizeSession(
  sessionId: string,
  actor: { id: string; role: UserRole },
) {
  const ses = await Session.findById(sessionId).lean();
  if (!ses) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  const studentId = String(ses.studentId);
  if (actor.role === 'teacher' && String(ses.teacherId) !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to summarize another teacher session');
  }

  const notesJoined = ses.quickNotes.map((q) => `${q.term} -> ${q.correction}`).join('; ');
  return runAnonymizedAiPipeline({
    feature: 'session_summary',
    studentId,
    actor,
    rawPrompt: `Title=${ses.title}\nSharedNotes=${ses.sharedNotes}\nQuickNotes=${notesJoined}`,
    context: { quickNotesCount: ses.quickNotes.length },
  });
}

export async function aiAnalyzeWeaknesses(
  input: { studentId?: string },
  actor: { id: string; role: UserRole },
) {
  const studentId = actor.role !== 'student' && input.studentId ? input.studentId : actor.id;
  const [profile, recentReports] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).lean(),
    SessionReport.find({ studentId }).sort({ submittedAt: -1 }).limit(5).lean(),
  ]);
  const weakestSkill = findWeakestSkill(profile?.skillScores);
  const weaknessesList = [
    ...(profile?.weaknesses ?? []),
    ...recentReports.flatMap((r) => r.weaknesses),
  ].join(', ');

  return runAnonymizedAiPipeline({
    feature: 'weakness_analysis',
    studentId,
    actor,
    rawPrompt: `CEFR=${profile?.currentCefr ?? 'B1'} WeakestSkill=${weakestSkill} ObservedWeaknesses=${weaknessesList}`,
    context: { weakestSkill, skillScores: profile?.skillScores },
  });
}

export async function aiExplainMatching(
  input: { studentId?: string; teacherId: string },
  actor: { id: string; role: UserRole },
) {
  const studentId = actor.role !== 'student' && input.studentId ? input.studentId : actor.id;
  const ranked = await matchTeachersForStudent(studentId);
  const chosen = ranked.find((r) => r.teacherUserId === input.teacherId) ?? ranked[0];
  const reasons = chosen?.reasons ?? ['Đúng mục tiêu đào tạo'];
  const matchScore = chosen?.score ?? 80;

  return runAnonymizedAiPipeline({
    feature: 'matching_explanation',
    studentId,
    actor,
    rawPrompt: `TeacherMatchScore=${matchScore} Reasons=${reasons.join(' | ')}`,
    context: { matchScore, reasons },
  });
}

export async function listAiLogs(
  actor: { id: string; role: UserRole },
  query: { studentId?: string; status?: string },
) {
  const filter: Record<string, unknown> = {};
  if (actor.role === 'student') {
    filter.studentId = actor.id;
  } else if (actor.role === 'teacher') {
    if (query.studentId) {
      await assertCanAccessStudentPath(query.studentId, actor);
      filter.studentId = query.studentId;
    } else {
      filter.actorId = actor.id;
    }
  } else if (query.studentId) {
    filter.studentId = query.studentId;
  }
  if (query.status) filter.status = query.status;

  const docs = await AILog.find(filter).sort({ createdAt: -1 }).limit(50).lean();
  return docs.map((d) => ({
    id: String(d._id),
    feature: d.feature,
    provider: d.provider,
    aiModel: d.aiModel,
    studentId: String(d.studentId),
    status: d.status,
    summary: d.summary,
    result: d.result,
    latencyMs: d.latencyMs,
    tokenEstimate: d.tokenEstimate,
    consentVerified: d.consentVerified,
    piiRedacted: d.piiRedacted,
    appliedTargetType: d.appliedTargetType,
    appliedTargetId: d.appliedTargetId,
    reviewedAt: d.reviewedAt,
    reviewNote: d.reviewNote,
  }));
}

/**
 * Human-in-the-loop gate (AGENTS.md #4):
 * Only teacher (for their student) or admin may approve/reject an AI proposal.
 */
export async function decideAiLogProposal(
  logId: string,
  input: DecideAiProposalInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot self-approve AI proposals');
  }

  const log = await AILog.findById(logId);
  if (!log) throw new AppError(404, 'NOT_FOUND', 'AI proposal log not found');
  await assertCanAccessStudentPath(String(log.studentId), actor);

  if (log.status !== 'proposed') {
    throw new AppError(409, 'INVALID_STATE', 'AI proposal has already been reviewed');
  }

  log.status = input.decision;
  log.reviewedBy = actor.id as unknown as typeof log.reviewedBy;
  log.reviewedAt = new Date();
  if (input.reviewNote) log.reviewNote = input.reviewNote;
  await log.save();

  if (log.appliedTargetType === 'Homework' && log.appliedTargetId) {
    if (input.decision === 'approved') {
      const hw = await Homework.findByIdAndUpdate(
        log.appliedTargetId,
        { $set: { proposedStatus: 'approved' } },
        { new: true },
      ).lean();
      if (hw) {
        await notifyUser({
          userId: String(log.studentId),
          type: 'system',
          title: `Bài tập mới được duyệt: ${hw.title}`,
          body: 'Giáo viên đã kiểm duyệt và giao bài tập luyện tập từ đề xuất AI.',
          dedupeKey: `hw_ai_approved:${String(hw._id)}`,
          referenceType: 'Homework',
          referenceId: String(hw._id),
        });
      }
    }
  }

  if (log.appliedTargetType === 'LearningPath' && log.appliedTargetId && log.appliedSubId) {
    const path = await LearningPath.findById(log.appliedTargetId);
    const ms = path?.milestones.find((m) => m.id === log.appliedSubId);
    if (path && ms && ms.status === 'proposed') {
      ms.status = input.decision === 'approved' ? 'pending' : 'rejected';
      ms.decidedBy = actor.id as unknown as typeof ms.decidedBy;
      ms.decidedAt = new Date();
      await path.save();
    }
  }

  await AuditLog.create({
    actorId: actor.id,
    action: `ai_proposal.${input.decision}`,
    entity: 'AILog',
    entityId: String(log._id),
    after: {
      feature: log.feature,
      decision: input.decision,
      appliedTargetType: log.appliedTargetType,
      appliedTargetId: log.appliedTargetId,
    },
    ip: actor.ip,
  });

  return {
    id: String(log._id),
    feature: log.feature,
    status: log.status,
    reviewedAt: log.reviewedAt,
    reviewNote: log.reviewNote,
  };
}
