import type { CefrLevel, SkillScores } from '@webenglish/shared';
import { scoreToCefrLevel } from '../../settings/services/policy.service.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { ProgressSnapshot } from '../models/progressSnapshot.model.js';

export const ALL_SKILL_KEYS: (keyof SkillScores)[] = [
  'listening',
  'speaking',
  'reading',
  'writing',
  'vocabulary',
  'grammar',
  'pronunciation',
];

export function averageSkillScore(scores: SkillScores): number {
  const sum = ALL_SKILL_KEYS.reduce((acc, k) => acc + (scores[k] ?? 50), 0);
  return Number((sum / ALL_SKILL_KEYS.length).toFixed(1));
}

export async function applyStudentSkillUpdate(params: {
  studentId: string;
  sessionId?: string;
  ratings: Partial<SkillScores>;
  alpha: number;
  source: 'report' | 'assessment' | 'manual';
  mode?: 'ema' | 'replace';
}): Promise<{
  cefrLevel: CefrLevel;
  overallScore: number;
  skillScores: SkillScores;
  snapshotId: string;
}> {
  let profile = await StudentProfile.findOne({ userId: params.studentId });
  if (!profile) {
    profile = await StudentProfile.create({ userId: params.studentId });
  }

  const nextScores: SkillScores = { ...profile.skillScores };
  const mode = params.mode ?? 'ema';

  for (const key of ALL_SKILL_KEYS) {
    const incoming = params.ratings[key];
    if (typeof incoming === 'number' && Number.isFinite(incoming)) {
      const prev = profile.skillScores[key] ?? 50;
      const updated =
        mode === 'replace'
          ? incoming
          : params.alpha * incoming + (1 - params.alpha) * prev;
      nextScores[key] = Math.min(100, Math.max(0, Math.round(updated * 10) / 10));
    }
  }

  const overallScore = averageSkillScore(nextScores);
  const nextCefr = scoreToCefrLevel(overallScore);

  profile.skillScores = nextScores;
  profile.currentCefr = nextCefr;
  await profile.save();

  const snapshot = await ProgressSnapshot.create({
    studentId: params.studentId,
    sessionId: params.sessionId,
    source: params.source,
    cefrLevel: nextCefr,
    overallScore,
    skillScores: nextScores,
    capturedAt: new Date(),
  });

  return {
    cefrLevel: nextCefr,
    overallScore,
    skillScores: nextScores,
    snapshotId: String(snapshot._id),
  };
}
