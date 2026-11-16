import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const lang = useUIStore((s) => s.lang);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    try {
      await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Allow UI preview fallback when API is offline
    }
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-16">
      <Panel className="p-6 sm:p-7">
        <h1 className="text-xl font-bold text-ink">{t('auth.forgotTitle')}</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">{t('auth.forgotSubtitle')}</p>

        {sent ? (
          <div className="mt-6 p-4 rounded-[var(--radius-md)] bg-[var(--status-completed-bg)] border border-[var(--status-completed-border)] text-[var(--status-completed-text)] space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {lang === 'vi' ? 'Đã gửi hướng dẫn khôi phục' : 'Reset instructions sent'}
              </span>
            </div>
            <p>
              {lang === 'vi'
                ? `Nếu email ${email} tồn tại trong hệ thống, liên kết đặt lại mật khẩu có hiệu lực trong 30 phút đã được gửi qua Mailpit/SMTP.`
                : `If ${email} matches an account, a 30-minute reset link has been queued.`}
            </p>
            <div className="pt-2">
              <Link to="/auth/login" className="font-semibold underline">
                {lang === 'vi' ? 'Quay lại đăng nhập' : 'Back to login'}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-ink mb-1.5">
                {t('auth.email')}
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="minhanh@example.com"
                className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
              />
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t('auth.sendResetBtn')}
            </Button>

            <p className="text-xs text-center text-ink-secondary">
              <Link to="/auth/login" className="text-accent hover:underline">
                {lang === 'vi' ? 'Quay lại trang đăng nhập' : 'Return to sign in'}
              </Link>
            </p>
          </form>
        )}
      </Panel>
    </div>
  );
}
