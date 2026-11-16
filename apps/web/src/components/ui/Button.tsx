import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-btn text-ink-btn-text hover:bg-ink-btn-hover border border-transparent',
  accent:
    'bg-accent text-[var(--accent-text)] hover:bg-accent-hover border border-transparent',
  secondary:
    'bg-subtle text-ink border border-hairline-strong hover:bg-hover',
  ghost:
    'bg-transparent text-ink-secondary hover:bg-hover hover:text-ink border border-transparent',
  danger:
    'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border border-[var(--status-alert-border)] hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)] gap-1.5',
  md: 'h-9 px-4 text-sm rounded-[var(--radius-md)] gap-2',
  lg: 'h-11 px-5 text-sm rounded-[var(--radius-lg)] gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium whitespace-nowrap ui-transition cursor-pointer select-none',
        'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
