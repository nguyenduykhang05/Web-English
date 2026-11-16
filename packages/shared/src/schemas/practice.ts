import { z } from 'zod';
import { CefrEnum, GoalTypeEnum } from '../enums.js';

export const VocabDeckCategoryEnum = z.enum([
  'cefr',
  'ielts',
  'business',
  'communication',
  'session_notes',
]);

export const SrsRatingEnum = z.enum(['again', 'hard', 'good', 'easy']);
export const PracticeMediaModeEnum = z.enum(['dictation', 'shadowing']);

export const ListDecksQuerySchema = z.object({
  category: VocabDeckCategoryEnum.optional(),
  cefrLevel: CefrEnum.optional(),
});

export const ReviewSrsCardSchema = z.object({
  cardId: z.string().trim().min(1),
  rating: SrsRatingEnum,
});

export const ToggleStarCardSchema = z.object({
  starred: z.boolean(),
});

export const CreateCustomVocabCardSchema = z.object({
  deckId: z.string().trim().min(1).optional(),
  term: z.string().trim().min(1).max(160),
  ipa: z.string().trim().max(120).optional(),
  partOfSpeech: z.string().trim().max(40).optional(),
  meaningVi: z.string().trim().min(1).max(400),
  definitionEn: z.string().trim().max(500).optional(),
  exampleEn: z.string().trim().max(500).optional(),
  contextNote: z.string().trim().max(400).optional(),
  cefrLevel: CefrEnum.optional(),
  goalType: GoalTypeEnum.optional(),
});

export const SubmitDictationAttemptSchema = z.object({
  lessonId: z.string().trim().min(1),
  segmentIndex: z.number().int().min(0).max(200),
  typedText: z.string().trim().min(1).max(1000),
});

export const SubmitShadowingAttemptSchema = z.object({
  lessonId: z.string().trim().min(1),
  segmentIndex: z.number().int().min(0).max(200),
  spokenTranscript: z.string().trim().min(1).max(1000),
  durationSec: z.number().min(0.3).max(120).optional(),
  audioUrl: z.string().trim().max(500).optional(),
});

export const ReviewPracticeAttemptSchema = z.object({
  decision: z.enum(['approved', 'needs_retry']),
  teacherFeedback: z.string().trim().max(1000).optional(),
  verifiedScore: z.number().min(0).max(100).optional(),
});

export const ImportYoutubeMediaSchema = z.object({
  youtubeUrl: z.string().trim().min(5).max(400),
  title: z.string().trim().min(2).max(200),
  cefrLevel: CefrEnum.default('B1'),
  topic: z.string().trim().max(120).default('YouTube Tự Học'),
  transcriptText: z.string().trim().max(15000).optional(),
});

export type VocabDeckCategory = z.infer<typeof VocabDeckCategoryEnum>;
export type SrsRating = z.infer<typeof SrsRatingEnum>;
export type PracticeMediaMode = z.infer<typeof PracticeMediaModeEnum>;
export type ReviewSrsCardInput = z.infer<typeof ReviewSrsCardSchema>;
export type ToggleStarCardInput = z.infer<typeof ToggleStarCardSchema>;
export type CreateCustomVocabCardInput = z.infer<typeof CreateCustomVocabCardSchema>;
export type SubmitDictationAttemptInput = z.infer<typeof SubmitDictationAttemptSchema>;
export type SubmitShadowingAttemptInput = z.infer<typeof SubmitShadowingAttemptSchema>;
export type ReviewPracticeAttemptInput = z.infer<typeof ReviewPracticeAttemptSchema>;
export type ImportYoutubeMediaInput = z.infer<typeof ImportYoutubeMediaSchema>;
