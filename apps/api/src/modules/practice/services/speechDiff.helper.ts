export interface WordDiffResult {
  expected: string;
  actual?: string;
  status: 'exact' | 'wrong' | 'missing' | 'extra';
}

export interface SpeechEvaluationResult {
  accuracyPct: number;
  completenessPct: number;
  fluencyPct?: number;
  autoScore: number;
  wordDiffs: WordDiffResult[];
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .trim();
}

export function tokenizeSentence(text: string): { raw: string; norm: string }[] {
  return text
    .split(/\s+/)
    .map((raw) => ({ raw: raw.trim(), norm: normalizeToken(raw) }))
    .filter((t) => t.norm.length > 0);
}

/**
 * Computes deterministic word-level alignment via DP LCS so missing, wrong, and exact words
 * are highlighted cleanly in Dictation and Shadowing feedback.
 */
export function evaluateWordSequence(
  expectedText: string,
  actualText: string,
  durationSec?: number,
): SpeechEvaluationResult {
  const expected = tokenizeSentence(expectedText);
  const actual = tokenizeSentence(actualText);

  const m = expected.length;
  const n = actual.length;
  if (m === 0) {
    return { accuracyPct: 100, completenessPct: 100, autoScore: 100, wordDiffs: [] };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (expected[i - 1].norm === actual[j - 1].norm) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedExpected = new Set<number>();
  const matchedActual = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (expected[i - 1].norm === actual[j - 1].norm) {
      matchedExpected.add(i - 1);
      matchedActual.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const unmatchedActualTokens = actual.filter((_, idx) => !matchedActual.has(idx));
  let unmatchedCursor = 0;

  const wordDiffs: WordDiffResult[] = expected.map((exp, idx) => {
    if (matchedExpected.has(idx)) {
      return { expected: exp.raw, actual: exp.raw, status: 'exact' };
    }
    const candidate = unmatchedActualTokens[unmatchedCursor];
    if (candidate) {
      unmatchedCursor += 1;
      return { expected: exp.raw, actual: candidate.raw, status: 'wrong' };
    }
    return { expected: exp.raw, status: 'missing' };
  });

  const exactCount = matchedExpected.size;
  const accuracyPct = Math.round((exactCount / m) * 100);
  const completenessPct = Math.min(100, Math.round((Math.min(n, m) / m) * 100));

  let fluencyPct: number | undefined;
  if (durationSec && durationSec > 0.3) {
    const wpm = (n / durationSec) * 60;
    // Ideal learner shadowing pacing is ~90–160 WPM
    if (wpm >= 85 && wpm <= 165) {
      fluencyPct = 95;
    } else if (wpm >= 60 && wpm <= 190) {
      fluencyPct = 82;
    } else {
      fluencyPct = 68;
    }
  }

  const autoScore =
    fluencyPct !== undefined
      ? Math.round(accuracyPct * 0.55 + completenessPct * 0.25 + fluencyPct * 0.2)
      : Math.round(accuracyPct * 0.75 + completenessPct * 0.25);

  return {
    accuracyPct,
    completenessPct,
    fluencyPct,
    autoScore,
    wordDiffs,
  };
}
