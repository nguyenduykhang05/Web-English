import type { AnswerPlacementStepInput, CefrLevel, SkillKey, SkillScores } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { applyStudentSkillUpdate } from '../../reports/services/skillMastery.helper.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { Assessment } from '../models/assessment.model.js';

interface PlacementQuestion {
  id: string;
  level: CefrLevel;
  skill: SkillKey;
  prompt: string;
  options: string[];
  correctIndex: number;
}

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_WEIGHT: Record<CefrLevel, number> = {
  A1: 18,
  A2: 32,
  B1: 50,
  B2: 68,
  C1: 82,
  C2: 94,
};

const QUESTION_BANK: PlacementQuestion[] = [
  {
    id: 'q-a1-1',
    level: 'A1',
    skill: 'grammar',
    prompt: 'She ___ to English class every Tuesday and Thursday.',
    options: ['go', 'goes', 'going', 'is go'],
    correctIndex: 1,
  },
  {
    id: 'q-a1-2',
    level: 'A1',
    skill: 'vocabulary',
    prompt: 'Choose the best reply: "Nice to meet you!"',
    options: ['Nice to meet you too.', 'I am twenty years.', 'Yes, please.', 'See yesterday.'],
    correctIndex: 0,
  },
  {
    id: 'q-a2-1',
    level: 'A2',
    skill: 'grammar',
    prompt: 'Yesterday we ___ a very interesting podcast about travel.',
    options: ['listen', 'listens', 'listened', 'listening'],
    correctIndex: 2,
  },
  {
    id: 'q-a2-2',
    level: 'A2',
    skill: 'pronunciation',
    prompt: 'Which word has the "-ed" ending pronounced /id/?',
    options: ['worked', 'played', 'wanted', 'washed'],
    correctIndex: 2,
  },
  {
    id: 'q-b1-1',
    level: 'B1',
    skill: 'grammar',
    prompt: 'If I ___ more free time, I would practice speaking every morning.',
    options: ['have', 'had', 'will have', 'am having'],
    correctIndex: 1,
  },
  {
    id: 'q-b1-2',
    level: 'B1',
    skill: 'vocabulary',
    prompt: 'Remote work can ___ commuting stress for many urban employees.',
    options: ['alleviate', 'insist', 'arrive', 'borrow'],
    correctIndex: 0,
  },
  {
    id: 'q-b2-1',
    level: 'B2',
    skill: 'speaking',
    prompt: 'Which discourse marker naturally introduces a contrasting IELTS Part 3 view?',
    options: [
      'On the other hand, one might argue that...',
      'By the way, yesterday...',
      'For this reason, yes...',
      'First of all, thank you...',
    ],
    correctIndex: 0,
  },
  {
    id: 'q-b2-2',
    level: 'B2',
    skill: 'reading',
    prompt: 'Not only ___ the quarterly target, but the team also lowered operational costs.',
    options: ['they exceeded', 'did they exceed', 'exceeded they', 'had exceed they'],
    correctIndex: 1,
  },
  {
    id: 'q-c1-1',
    level: 'C1',
    skill: 'writing',
    prompt: 'Choose the most cohesive academic phrasing for policy trade-offs:',
    options: [
      'Notwithstanding short-term fiscal constraints, long-term gains are compelling.',
      'Even though money is low now, later it gets nice.',
      'Because of money problem, it maybe good.',
      'However short money is, good results happen.',
    ],
    correctIndex: 0,
  },
  {
    id: 'q-c1-2',
    level: 'C1',
    skill: 'listening',
    prompt: 'What does a speaker imply by saying "That proposal barely scratched the surface"?',
    options: [
      'It addressed only superficial aspects of the issue.',
      'It resolved every root cause completely.',
      'It was too lengthy for the meeting.',
      'It caused physical damage.',
    ],
    correctIndex: 0,
  },
  {
    id: 'q-c2-1',
    level: 'C2',
    skill: 'vocabulary',
    prompt: 'Select the precise collocation: "The committee reached a ___ consensus after hours of debate."',
    options: ['tenuous', 'thick', 'heavy', 'loud'],
    correctIndex: 0,
  },
  {
    id: 'q-c2-2',
    level: 'C2',
    skill: 'grammar',
    prompt: '___ earlier, the merger could have avoided regulatory scrutiny.',
    options: ['Were they to disclose', 'Had they disclosed', 'Should they disclose', 'Did they disclose'],
    correctIndex: 1,
  },
];

function stepLevel(current: CefrLevel, up: boolean): CefrLevel {
  const idx = LEVEL_ORDER.indexOf(current);
  if (up) return LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, idx + 1)];
  return LEVEL_ORDER[Math.max(0, idx - 1)];
}

function pickNextQuestion(targetLevel: CefrLevel, askedIds: string[]): PlacementQuestion | null {
  const unasked = QUESTION_BANK.filter((q) => !askedIds.includes(q.id));
  if (unasked.length === 0) return null;

  const exact = unasked.find((q) => q.level === targetLevel);
  if (exact) return exact;

  const targetIdx = LEVEL_ORDER.indexOf(targetLevel);
  unasked.sort(
    (a, b) =>
      Math.abs(LEVEL_ORDER.indexOf(a.level) - targetIdx) -
      Math.abs(LEVEL_ORDER.indexOf(b.level) - targetIdx),
  );
  return unasked[0];
}

function formatPublicQuestion(q: PlacementQuestion) {
  return {
    id: q.id,
    level: q.level,
    skill: q.skill,
    prompt: q.prompt,
    options: q.options,
  };
}

export async function startPlacementTest(studentId: string) {
  const assessment = await Assessment.create({
    studentId,
    type: 'placement',
    status: 'in_progress',
    currentLevel: 'B1',
    maxQuestions: 6,
    askedQuestionIds: [],
    answers: [],
  });

  const firstQuestion = pickNextQuestion('B1', []);
  if (!firstQuestion) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Placement question bank empty');
  }

  assessment.askedQuestionIds.push(firstQuestion.id);
  await assessment.save();

  return {
    assessmentId: String(assessment._id),
    status: assessment.status,
    step: 1,
    totalSteps: assessment.maxQuestions,
    question: formatPublicQuestion(firstQuestion),
  };
}

export async function answerPlacementStep(
  assessmentId: string,
  studentId: string,
  input: AnswerPlacementStepInput,
) {
  const assessment = await Assessment.findOne({ _id: assessmentId, studentId });
  if (!assessment) {
    throw new AppError(404, 'NOT_FOUND', 'Placement assessment not found');
  }
  if (assessment.status === 'completed') {
    throw new AppError(409, 'ALREADY_COMPLETED', 'Assessment is already completed');
  }

  const question = QUESTION_BANK.find((q) => q.id === input.questionId);
  if (!question || !assessment.askedQuestionIds.includes(input.questionId)) {
    throw new AppError(400, 'INVALID_QUESTION', 'Question does not match active step');
  }
  if (assessment.answers.some((a) => a.questionId === input.questionId)) {
    throw new AppError(409, 'DUPLICATE_ANSWER', 'Question was already answered');
  }

  const isCorrect = input.selectedIndex === question.correctIndex;
  assessment.answers.push({
    questionId: question.id,
    level: question.level,
    skill: question.skill,
    selectedIndex: input.selectedIndex,
    correct: isCorrect,
    answeredAt: new Date(),
  });

  const nextTargetLevel = stepLevel(assessment.currentLevel, isCorrect);
  assessment.currentLevel = nextTargetLevel;

  const isFinished = assessment.answers.length >= assessment.maxQuestions;
  const nextQuestion = isFinished
    ? null
    : pickNextQuestion(nextTargetLevel, assessment.askedQuestionIds);

  if (!isFinished && nextQuestion) {
    assessment.askedQuestionIds.push(nextQuestion.id);
    await assessment.save();
    return {
      assessmentId: String(assessment._id),
      completed: false,
      lastAnswerCorrect: isCorrect,
      currentLevel: assessment.currentLevel,
      step: assessment.answers.length + 1,
      totalSteps: assessment.maxQuestions,
      question: formatPublicQuestion(nextQuestion),
    };
  }

  // Compute overall weighted score & 7 skill baseline
  let scoreTotal = 0;
  for (const ans of assessment.answers) {
    const base = LEVEL_WEIGHT[ans.level];
    scoreTotal += ans.correct ? Math.min(98, base + 12) : Math.max(12, base - 22);
  }
  const overallScore = Number((scoreTotal / Math.max(1, assessment.answers.length)).toFixed(1));

  const skillRatings: SkillScores = {
    listening: overallScore,
    speaking: Math.max(15, Number((overallScore - 3).toFixed(1))),
    reading: overallScore,
    writing: Math.max(15, Number((overallScore - 2).toFixed(1))),
    vocabulary: overallScore,
    grammar: overallScore,
    pronunciation: Math.max(15, Number((overallScore - 4).toFixed(1))),
  };

  for (const ans of assessment.answers) {
    const delta = ans.correct ? 6 : -6;
    const prev = skillRatings[ans.skill];
    skillRatings[ans.skill] = Math.min(98, Math.max(10, Number((prev + delta).toFixed(1))));
  }

  const progressResult = await applyStudentSkillUpdate({
    studentId,
    ratings: skillRatings,
    alpha: 1,
    source: 'assessment',
    mode: 'replace',
  });

  assessment.status = 'completed';
  assessment.overallScore = progressResult.overallScore;
  assessment.cefrResult = progressResult.cefrLevel;
  assessment.skillScores = progressResult.skillScores;
  assessment.completedAt = new Date();
  await assessment.save();

  await AuditLog.create({
    actorId: studentId,
    action: 'assessment.placement_completed',
    entity: 'Assessment',
    entityId: String(assessment._id),
    after: {
      overallScore: assessment.overallScore,
      cefrResult: assessment.cefrResult,
      answeredCount: assessment.answers.length,
    },
  });

  return {
    assessmentId: String(assessment._id),
    completed: true,
    lastAnswerCorrect: isCorrect,
    overallScore: assessment.overallScore,
    cefrResult: assessment.cefrResult,
    skillScores: assessment.skillScores,
  };
}
