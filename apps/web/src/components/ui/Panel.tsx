import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  soft?: boolean;
}

export function Panel({ children, className, padded = true, soft = false }: PanelProps) {
  return (
    <section
      className={cn(
        'border border-hairline rounded-[var(--radius-lg)]',
        soft ? 'surface-bezel' : 'bg-surface',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}
