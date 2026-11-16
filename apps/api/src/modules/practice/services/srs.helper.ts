import type { SrsRating } from '@webenglish/shared';

export interface SrsCardState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
}

export interface SrsScheduleResult extends SrsCardState {
  dueAt: Date;
  labelVi: string;
}

const RATING_QUALITY: Record<SrsRating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export function formatIntervalVi(days: number): string {
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return '1 ngày';
  if (days < 30) return `${days} ngày`;
  const months = Math.round(days / 30);
  return `${months} tháng`;
}

export function computeNextSrsState(
  current: SrsCardState,
  rating: SrsRating,
  now = new Date(),
): SrsScheduleResult {
  const quality = RATING_QUALITY[rating];
  let repetitions = current.repetitions;
  let intervalDays = current.intervalDays;
  let easeFactor = current.easeFactor || 2.5;
  let lapses = current.lapses;

  if (rating === 'again') {
    repetitions = 0;
    intervalDays = 0;
    lapses += 1;
  } else {
    if (repetitions === 0) {
      intervalDays = rating === 'easy' ? 4 : rating === 'hard' ? 1 : 1;
    } else if (repetitions === 1) {
      intervalDays = rating === 'easy' ? 8 : rating === 'hard' ? 3 : 6;
    } else {
      const multiplier = rating === 'hard' ? 1.2 : rating === 'easy' ? easeFactor * 1.3 : easeFactor;
      intervalDays = Math.max(1, Math.round(intervalDays * multiplier));
    }
    repetitions += 1;
  }

  // Standard SM-2 ease factor update clamped to [1.3, 3.0]
  const qDiff = 5 - quality;
  easeFactor = easeFactor + (0.1 - qDiff * (0.08 + qDiff * 0.02));
  easeFactor = Math.min(3.0, Math.max(1.3, Number(easeFactor.toFixed(2))));

  const dueAt =
    intervalDays === 0
      ? new Date(now.getTime() + 10 * 60_000)
      : new Date(now.getTime() + intervalDays * 86_400_000);

  return {
    repetitions,
    intervalDays,
    easeFactor,
    lapses,
    dueAt,
    labelVi: formatIntervalVi(intervalDays),
  };
}

export function previewSrsIntervals(
  current: SrsCardState,
  now = new Date(),
): Record<SrsRating, string> {
  return {
    again: computeNextSrsState(current, 'again', now).labelVi,
    hard: computeNextSrsState(current, 'hard', now).labelVi,
    good: computeNextSrsState(current, 'good', now).labelVi,
    easy: computeNextSrsState(current, 'easy', now).labelVi,
  };
}
