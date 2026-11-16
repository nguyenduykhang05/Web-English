import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LedgerEntry, SkillKey } from '@/types/domain';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Single source of truth: derive remaining session balance directly from sessionLedger.
 */
export function computeLedgerBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.delta, 0);
}

export const SKILL_LABELS: Record<SkillKey, { vi: string; en: string }> = {
  listening: { vi: 'Nghe (Listening)', en: 'Listening' },
  speaking: { vi: 'Nói (Speaking)', en: 'Speaking' },
  reading: { vi: 'Đọc (Reading)', en: 'Reading' },
  writing: { vi: 'Viết (Writing)', en: 'Writing' },
  vocabulary: { vi: 'Từ vựng', en: 'Vocabulary' },
  grammar: { vi: 'Ngữ pháp', en: 'Grammar' },
  pronunciation: { vi: 'Phát âm', en: 'Pronunciation' },
};
