import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';

export function ToastViewport() {
  const { toasts, dismissToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-[var(--radius-md)] bg-surface border border-hairline-strong surface-popover"
        >
          <div className="mt-0.5 shrink-0">
            {toast.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--status-completed-text)]" aria-hidden="true" />
            ) : toast.tone === 'warning' || toast.tone === 'danger' ? (
              <AlertTriangle className="h-4 w-4 text-[var(--status-proposed-text)]" aria-hidden="true" />
            ) : (
              <Info className="h-4 w-4 text-accent" aria-hidden="true" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">{toast.title}</p>
            {toast.description && (
              <p className="mt-0.5 text-xs text-ink-secondary">{toast.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Đóng thông báo"
            className="p-1 rounded-[var(--radius-sm)] text-ink-muted hover:text-ink hover:bg-subtle cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
