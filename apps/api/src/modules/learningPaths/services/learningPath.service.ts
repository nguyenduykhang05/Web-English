import { randomUUID } from 'crypto';
import type {
  CefrLevel,
  CreatePathTemplateInput,
  GenerateLearningPathInput,
  GoalType,
  MilestoneDecisionInput,
  SkillScores,
  UpdateMilestoneProgressInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { getStudentBalance } from '../../ledger/services/ledger.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { ALL_SKILL_KEYS } from '../../reports/services/skillMastery.helper.js';
import { LearningPath, type ILearningMilestone, type ILearningPath } from '../models/learningPath.model.js';
import { PathTemplate } from '../models/pathTemplate.model.js';

const DEFAULT_FALLBACK_MILESTONES: ILearningMilestone[] = [
  {
    id: 'ms-base-1',
    title: 'Nền tảng phát âm chuẩn IPA & Phản xạ câu hỏi ngắn',
    description: 'Chuẩn hoá âm cuối, ngữ điệu tự nhiên và phản xạ tức thì 1-1.',
    cefrTarget: 'B1',
    skillFocus: 'pronunciation',
    plannedSessions: 4,
    completedSessions: 0,
    status: 'in_progress',
    source: 'template',
  },
  {
    id: 'ms-base-2',
    title: 'Mở rộng diễn đạt & Từ vựng theo chủ đề mục tiêu',
    description: 'Xây dựng vốn collocations và cấu trúc câu phức tự nhiên.',
    cefrTarget: 'B2',
    skillFocus: 'speaking',
    plannedSessions: 6,
    completedSessions: 0,
    status: 'pending',
    source: 'template',
  },
  {
    id: 'ms-base-3',
    title: 'Tổng duyệt mô phỏng 1-1 & Phản biện chuyên sâu',
    description: 'Kiểm tra tiến bộ tổng thể và tối ưu tốc độ phản xạ.',
    cefrTarget: 'B2',
    skillFocus: 'vocabulary',
    plannedSessions: 4,
    completedSessions: 0,
    status: 'pending',
    source: 'template',
  },
];

export async function assertCanAccessStudentPath(
  studentId: string,
  actor: { id: string; role: UserRole },
): Promise<void> {
  if (actor.role === 'admin') return;
  if (actor.role === 'student' && actor.id === studentId) return;
  if (actor.role === 'teacher') {
    const [hasEnrollment, hasSession] = await Promise.all([
      Enrollment.exists({ studentId, teacherId: actor.id }),
      Session.exists({ studentId, teacherId: actor.id }),
    ]);
    if (hasEnrollment || hasSession) return;
  }
  throw new AppError(403, 'FORBIDDEN', 'Access denied to this student learning path');
}

export function computePaceStatus(
  path: Pick<ILearningPath, 'milestones'>,
  deadline?: Date,
  remainingCredits = 0,
): 'on_track' | 'at_risk' | 'off_track' {
  const activeMilestones = path.milestones.filter(
    (m) => m.status !== 'proposed' && m.status !== 'rejected',
  );
  const totalPlanned = activeMilestones.reduce((sum, m) => sum + m.plannedSessions, 0);
  const totalDone = activeMilestones.reduce((sum, m) => sum + m.completedSessions, 0);
  const remainingNeeded = Math.max(0, totalPlanned - totalDone);

  if (remainingNeeded > 0 && remainingCredits === 0 && totalDone === 0) {
    return 'at_risk';
  }
  if (!deadline) {
    return totalPlanned > 0 && totalDone >= totalPlanned * 0.2 ? 'on_track' : 'on_track';
  }

  const daysLeft = Math.max(0, (deadline.getTime() - Date.now()) / 86_400_000);
  const maxSessionsPossibleAt2PerWeek = (daysLeft / 7) * 2;
  if (remainingNeeded > maxSessionsPossibleAt2PerWeek * 1.5) return 'off_track';
  if (remainingNeeded > maxSessionsPossibleAt2PerWeek) return 'at_risk';
  return 'on_track';
}

export async function createPathTemplate(
  input: CreatePathTemplateInput,
  actor: { id: string; ip?: string },
) {
  const doc = await PathTemplate.findOneAndUpdate(
    { code: input.code },
    input,
    { new: true, upsert: true },
  ).lean();

  await AuditLog.create({
    actorId: actor.id,
    action: 'path_template.upserted',
    entity: 'PathTemplate',
    entityId: String(doc._id),
    after: { code: doc.code, milestoneCount: doc.milestones.length },
    ip: actor.ip,
  });

  return doc;
}

export async function listPathTemplates() {
  return PathTemplate.find({ isActive: true }).sort({ createdAt: -1 }).lean();
}

export async function generatePersonalizedPath(
  input: GenerateLearningPathInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const targetStudentId =
    actor.role !== 'student' && input.studentId ? input.studentId : actor.id;

  await assertCanAccessStudentPath(targetStudentId, actor);

  const profile = await StudentProfile.findOne({ userId: targetStudentId }).lean();
  const goalType: GoalType = input.goalType ?? profile?.goal?.goalType ?? 'ielts';
  const targetCefr: CefrLevel = input.targetCefr ?? 'B2';

  const template = input.templateCode
    ? await PathTemplate.findOne({ code: input.templateCode.toUpperCase(), isActive: true }).lean()
    : await PathTemplate.findOne({ goalType, isActive: true }).lean();

  const baseMilestones: ILearningMilestone[] = template
    ? template.milestones.map((m, idx) => ({
        id: `ms-${randomUUID().slice(0, 6)}`,
        title: m.title,
        description: m.description,
        cefrTarget: m.cefrTarget,
        skillFocus: m.skillFocus,
        plannedSessions: m.plannedSessions,
        completedSessions: 0,
        status: idx === 0 ? ('in_progress' as const) : ('pending' as const),
        source: 'template' as const,
      }))
    : DEFAULT_FALLBACK_MILESTONES.map((m) => ({
        ...m,
        id: `ms-${randomUUID().slice(0, 6)}`,
      }));

  // Rule Engine: detect weakest skill (< 55) or high readiness (>= 78) and emit PROPOSED adjustment
  if (profile?.skillScores) {
    const scores: SkillScores = profile.skillScores;
    let weakestKey: keyof SkillScores = 'speaking';
    let lowestVal = 100;
    for (const k of ALL_SKILL_KEYS) {
      if ((scores[k] ?? 50) < lowestVal) {
        lowestVal = scores[k] ?? 50;
        weakestKey = k;
      }
    }

    if (lowestVal < 55) {
      baseMilestones.unshift({
        id: `prop-${randomUUID().slice(0, 6)}`,
        title: `Đề xuất củng cố ${weakestKey.toUpperCase()} (${lowestVal}/100)`,
        description: `Rule engine phát hiện kỹ năng ${weakestKey} đang ở mức ${lowestVal}/100. Đề xuất bổ sung 2 buổi rèn chuyên biệt.`,
        cefrTarget: profile.currentCefr,
        skillFocus: weakestKey,
        plannedSessions: 2,
        completedSessions: 0,
        status: 'proposed',
        source: 'rule_engine',
        adjustmentType: 'reinforce',
        aiReason: `Điểm ${weakestKey} (${lowestVal}) thấp hơn ngưỡng mục tiêu 55; đề xuất giáo viên phê duyệt bổ sung 2 buổi.`,
      });
    } else if (lowestVal >= 75) {
      baseMilestones.push({
        id: `prop-${randomUUID().slice(0, 6)}`,
        title: 'Đề xuất tăng tốc lên cấp độ nâng cao',
        description: 'Các kỹ năng đồng đều >= 75/100. Đề xuất rút ngắn chặng nền và luyện đề nâng cao.',
        cefrTarget: targetCefr,
        skillFocus: 'speaking',
        plannedSessions: 3,
        completedSessions: 0,
        status: 'proposed',
        source: 'rule_engine',
        adjustmentType: 'accelerate',
        aiReason: `Tất cả kỹ năng đều >= ${lowestVal}/100, phù hợp tăng tốc lộ trình.`,
      });
    }
  }

  const remainingCredits = await getStudentBalance(targetStudentId);
  const paceStatus = computePaceStatus(
    { milestones: baseMilestones },
    profile?.goal?.deadline,
    remainingCredits,
  );

  const created = await LearningPath.create({
    studentId: targetStudentId,
    templateCode: template?.code,
    title: template?.title ?? `Lộ trình ${goalType.toUpperCase()} cá nhân hoá`,
    goalType,
    targetCefr,
    milestones: baseMilestones,
    paceStatus,
  });

  await AuditLog.create({
    actorId: actor.id,
    action: 'learning_path.generated',
    entity: 'LearningPath',
    entityId: String(created._id),
    after: {
      studentId: targetStudentId,
      goalType,
      milestoneCount: baseMilestones.length,
      proposedCount: baseMilestones.filter((m) => m.status === 'proposed').length,
    },
    ip: actor.ip,
  });

  return created;
}

export async function getActiveLearningPath(
  studentId: string,
  actor: { id: string; role: UserRole },
) {
  await assertCanAccessStudentPath(studentId, actor);

  const path = await LearningPath.findOne({ studentId }).sort({ createdAt: -1 });
  if (!path) return null;

  const [profile, remainingCredits] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).select('goal').lean(),
    getStudentBalance(studentId),
  ]);

  const pace = computePaceStatus(path, profile?.goal?.deadline, remainingCredits);
  if (path.paceStatus !== pace) {
    path.paceStatus = pace;
    await path.save();
  }
  return path;
}

/**
 * Human-in-the-loop gate (AGENTS.md #4):
 * Only assigned teacher or admin can accept/reject a 'proposed' milestone.
 */
export async function decideMilestoneProposal(
  pathId: string,
  milestoneId: string,
  input: MilestoneDecisionInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Students cannot approve adaptive learning path proposals; teacher or admin review is required',
    );
  }

  const path = await LearningPath.findById(pathId);
  if (!path) {
    throw new AppError(404, 'NOT_FOUND', 'Learning path not found');
  }

  await assertCanAccessStudentPath(String(path.studentId), actor);

  const milestone = path.milestones.find((m) => m.id === milestoneId);
  if (!milestone) {
    throw new AppError(404, 'NOT_FOUND', 'Milestone not found');
  }
  if (milestone.status !== 'proposed') {
    throw new AppError(409, 'INVALID_STATE', 'Only proposed milestones can be approved or rejected');
  }

  milestone.status = input.decision === 'accepted' ? 'pending' : 'rejected';
  if (input.editedTitle) milestone.title = input.editedTitle;
  if (input.editedPlannedSessions !== undefined) {
    milestone.plannedSessions = input.editedPlannedSessions;
  }
  milestone.decidedBy = actor.id as unknown as typeof milestone.decidedBy;
  milestone.decidedAt = new Date();
  await path.save();

  await AuditLog.create({
    actorId: actor.id,
    action: `learning_path.proposal_${input.decision}`,
    entity: 'LearningPath',
    entityId: String(path._id),
    after: {
      milestoneId,
      decision: input.decision,
      title: milestone.title,
      plannedSessions: milestone.plannedSessions,
    },
    ip: actor.ip,
  });

  return path;
}

export async function updateMilestoneProgress(
  pathId: string,
  milestoneId: string,
  input: UpdateMilestoneProgressInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Only teachers or admins update milestone mastery status');
  }
  const path = await LearningPath.findById(pathId);
  if (!path) throw new AppError(404, 'NOT_FOUND', 'Learning path not found');
  await assertCanAccessStudentPath(String(path.studentId), actor);

  const ms = path.milestones.find((m) => m.id === milestoneId);
  if (!ms) throw new AppError(404, 'NOT_FOUND', 'Milestone not found');
  if (ms.status === 'proposed' || ms.status === 'rejected') {
    throw new AppError(409, 'INVALID_STATE', 'Cannot track progress on unapproved milestone');
  }

  ms.status = input.status;
  ms.completedSessions = input.completedSessions;
  await path.save();
  return path;
}

export async function proposeAdaptiveMilestoneIfTriggered(
  studentId: string,
  trigger: {
    skillFocus: keyof SkillScores;
    score: number;
  },
): Promise<boolean> {
  const path = await LearningPath.findOne({ studentId }).sort({ createdAt: -1 });
  if (!path) return false;

  const alreadyPendingSame = path.milestones.some(
    (m) => m.status === 'proposed' && m.skillFocus === trigger.skillFocus,
  );
  if (alreadyPendingSame) return false;

  if (trigger.score < 55) {
    path.milestones.push({
      id: `prop-${randomUUID().slice(0, 6)}`,
      title: `Đề xuất củng cố ${trigger.skillFocus.toUpperCase()} sau bài tập (${trigger.score}đ)`,
      description: `Điểm bài tập gần đây đạt ${trigger.score}/100 (< 55). Đề xuất thêm 2 buổi luyện tập trung.`,
      cefrTarget: path.targetCefr,
      skillFocus: trigger.skillFocus,
      plannedSessions: 2,
      completedSessions: 0,
      status: 'proposed',
      source: 'rule_engine',
      adjustmentType: 'reinforce',
      aiReason: `Kết quả bài tập ${trigger.skillFocus} đạt ${trigger.score}/100 (< 55).`,
    });
    await path.save();
    return true;
  }

  if (trigger.score >= 88) {
    path.milestones.push({
      id: `prop-${randomUUID().slice(0, 6)}`,
      title: `Đề xuất tăng tốc ${trigger.skillFocus.toUpperCase()} (${trigger.score}đ)`,
      description: `Kết quả xuất sắc ${trigger.score}/100 (>= 88). Đề xuất nâng độ khó bài luyện tiếp theo.`,
      cefrTarget: path.targetCefr,
      skillFocus: trigger.skillFocus,
      plannedSessions: 2,
      completedSessions: 0,
      status: 'proposed',
      source: 'rule_engine',
      adjustmentType: 'accelerate',
      aiReason: `Điểm ${trigger.skillFocus} đạt ${trigger.score}/100 (>= 88).`,
    });
    await path.save();
    return true;
  }

  return false;
}
