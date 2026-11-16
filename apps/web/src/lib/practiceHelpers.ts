import type { ApiWordDiffDto } from '@/lib/apiClient';

export type SrsRatingKey = 'again' | 'hard' | 'good' | 'easy';

export function playPronunciation(text: string, audioUrl?: string, rate = 1.0): void {
  if (typeof window === 'undefined') return;

  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      audio.playbackRate = rate;
      void audio.play().catch(() => {
        speakWithTts(text, rate);
      });
      return;
    } catch {
      // Fall through to SpeechSynthesis
    }
  }
  speakWithTts(text, rate);
}

export function speakWithTts(text: string, rate = 1.0): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = Math.min(1.5, Math.max(0.5, rate));
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore audio errors in headless environments
  }
}

export function computeClientSrsPreview(
  repetitions: number,
  intervalDays: number,
  easeFactor: number,
  rating: SrsRatingKey,
): { repetitions: number; intervalDays: number; easeFactor: number; labelVi: string } {
  const qualityMap: Record<SrsRatingKey, number> = { again: 1, hard: 3, good: 4, easy: 5 };
  const q = qualityMap[rating];
  let nextRep = repetitions;
  let nextInt = intervalDays;
  let nextEf = easeFactor || 2.5;

  if (rating === 'again') {
    nextRep = 0;
    nextInt = 0;
  } else {
    if (nextRep === 0) {
      nextInt = rating === 'easy' ? 4 : 1;
    } else if (nextRep === 1) {
      nextInt = rating === 'easy' ? 8 : rating === 'hard' ? 3 : 6;
    } else {
      const mult = rating === 'hard' ? 1.2 : rating === 'easy' ? nextEf * 1.3 : nextEf;
      nextInt = Math.max(1, Math.round(nextInt * mult));
    }
    nextRep += 1;
  }

  const qDiff = 5 - q;
  nextEf = Math.min(3.0, Math.max(1.3, Number((nextEf + (0.1 - qDiff * (0.08 + qDiff * 0.02))).toFixed(2))));
  const labelVi = nextInt <= 0 ? 'Hôm nay' : nextInt === 1 ? '1 ngày' : `${nextInt} ngày`;
  return { repetitions: nextRep, intervalDays: nextInt, easeFactor: nextEf, labelVi };
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .trim();
}

export function evaluatePracticeTextClient(
  expectedText: string,
  actualText: string,
  durationSec?: number,
): {
  accuracyPct: number;
  completenessPct: number;
  fluencyPct?: number;
  autoScore: number;
  wordDiffs: ApiWordDiffDto[];
} {
  const expected = expectedText
    .split(/\s+/)
    .map((raw) => ({ raw: raw.trim(), norm: normalizeToken(raw) }))
    .filter((t) => t.norm.length > 0);
  const actual = actualText
    .split(/\s+/)
    .map((raw) => ({ raw: raw.trim(), norm: normalizeToken(raw) }))
    .filter((t) => t.norm.length > 0);

  const m = expected.length;
  const n = actual.length;
  if (m === 0) {
    return { accuracyPct: 100, completenessPct: 100, autoScore: 100, wordDiffs: [] };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        expected[i - 1].norm === actual[j - 1].norm
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matchedExp = new Set<number>();
  const matchedAct = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (expected[i - 1].norm === actual[j - 1].norm) {
      matchedExp.add(i - 1);
      matchedAct.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const extras = actual.filter((_, idx) => !matchedAct.has(idx));
  let cursor = 0;
  const wordDiffs: ApiWordDiffDto[] = expected.map((exp, idx) => {
    if (matchedExp.has(idx)) {
      return { expected: exp.raw, actual: exp.raw, status: 'exact' };
    }
    const candidate = extras[cursor];
    if (candidate) {
      cursor += 1;
      return { expected: exp.raw, actual: candidate.raw, status: 'wrong' };
    }
    return { expected: exp.raw, status: 'missing' };
  });

  const accuracyPct = Math.round((matchedExp.size / m) * 100);
  const completenessPct = Math.min(100, Math.round((Math.min(n, m) / m) * 100));
  const fluencyPct =
    durationSec && durationSec > 0.3
      ? (n / durationSec) * 60 >= 85 && (n / durationSec) * 60 <= 165
        ? 95
        : 80
      : undefined;
  const autoScore =
    fluencyPct !== undefined
      ? Math.round(accuracyPct * 0.55 + completenessPct * 0.25 + fluencyPct * 0.2)
      : Math.round(accuracyPct * 0.75 + completenessPct * 0.25);

  return { accuracyPct, completenessPct, fluencyPct, autoScore, wordDiffs };
}

export function maskSentenceForDictation(sentence: string, revealedIndices: number[]): string[] {
  return sentence.split(/\s+/).map((token, idx) => {
    if (revealedIndices.includes(idx)) return token;
    const clean = token.replace(/[^a-zA-Z0-9']/g, '');
    if (clean.length <= 1) return token;
    return `${clean[0]}${'_'.repeat(Math.min(6, clean.length - 1))}`;
  });
}

export function splitHighlightedWord(
  word: string,
  highlightPart: string,
): { prefix: string; match: string; suffix: string } {
  const cleanPattern = highlightPart.replace('_', '');
  const idx = word.toLowerCase().indexOf(cleanPattern.toLowerCase());
  if (idx === -1) {
    return { prefix: word, match: '', suffix: '' };
  }
  return {
    prefix: word.slice(0, idx),
    match: word.slice(idx, idx + cleanPattern.length),
    suffix: word.slice(idx + cleanPattern.length),
  };
}
