import { describe, expect, it } from 'vitest';
import { computeLedgerBalance, formatVND } from './utils';
import { INITIAL_LEDGER, TEACHERS } from '@/data/mockPlatformData';
import { usePlatformStore } from '@/stores/usePlatformStore';

describe('WebEnglish sessionLedger & UI store invariants', () => {
  it('computes remaining sessions strictly from ledger entries', () => {
    expect(computeLedgerBalance(INITIAL_LEDGER)).toBe(14);
    expect(formatVND(3480000)).toContain('3.480.000');
  });

  it('debits on booking, refunds on valid cancellation, and requires human decision for AI proposals', () => {
    const store = usePlatformStore.getState();
    const initialBalance = computeLedgerBalance(store.ledger);

    const booked = store.bookSlot(TEACHERS[0], TEACHERS[0].availableSlots[0].id, false);
    expect(booked).toBe(true);

    const afterBooking = usePlatformStore.getState();
    expect(computeLedgerBalance(afterBooking.ledger)).toBe(initialBalance - 1);

    const newestSession = afterBooking.sessions[0];
    afterBooking.cancelSession(newestSession.id, true);

    const afterCancel = usePlatformStore.getState();
    expect(computeLedgerBalance(afterCancel.ledger)).toBe(initialBalance);

    const proposed = afterCancel.milestones.find((m) => m.status === 'proposed');
    expect(proposed).toBeDefined();
    if (proposed) {
      afterCancel.decideProposedMilestone(proposed.id, 'accepted', 'Ms. Sarah Jenkins');
      const afterApprove = usePlatformStore.getState();
      const updated = afterApprove.milestones.find((m) => m.id === proposed.id);
      expect(updated?.status).toBe('in_progress');
      expect(updated?.humanDecisionBy).toBe('Ms. Sarah Jenkins');
    }
  });
});
