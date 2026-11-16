import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type BadgeTone = 'neutral' | 'proposed' | 'confirmed' | 'completed' | 'alert';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  soft?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-ink-secondary border border-hairline',
  proposed:
    'bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)] border border-[var(--status-proposed-border)]',
  confirmed:
    'bg-[var(--status-confirmed-bg)] text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]',
  completed:
    'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border border-[var(--status-completed-border)]',
  alert:
    'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border border-[var(--status-alert-border)]',
};

const TONE_SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-subtle/60 text-ink-secondary border border-hairline/80',
  proposed:
    'bg-[var(--status-proposed-bg)]/70 text-[var(--status-proposed-text)] border border-[var(--status-proposed-border)]/80',
  confirmed:
    'bg-[var(--status-confirmed-bg)]/70 text-[var(--status-confirmed-text)] border border-[var(--status-confirmed-border)]/80',
  completed:
    'bg-[var(--status-completed-bg)]/70 text-[var(--status-completed-text)] border border-[var(--status-completed-border)]/80',
  alert:
    'bg-[var(--status-alert-bg)]/70 text-[var(--status-alert-text)] border border-[var(--status-alert-border)]/80',
};

export function Badge({ tone = 'neutral', children, className, soft = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ui-transition',
        soft ? TONE_SOFT[tone] : TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProposedAIBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone="proposed" className={cn('border-dashed', className)}>
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true" className="text-xs leading-none">✦</span>
        <span>{t('common.aiProposedBadge')}</span>
      </span>
    </Badge>
  );
}
