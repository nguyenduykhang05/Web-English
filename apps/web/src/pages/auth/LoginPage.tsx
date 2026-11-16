import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ErrorNotice } from '@/components/ui/States';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setPreviewRole, pushToast, lang } = useUIStore();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin@123456');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.includes('@') || password.length < 6) {
      setErrorMsg(
        lang === 'vi'
          ? 'Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.'
          : 'Please enter a valid email and at least 6 password characters.',
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const payload = (await res.json()) as {
          data?: { accessToken?: string; user?: { role?: 'admin' | 'teacher' | 'student' } };
        };
        const role = payload.data?.user?.role ?? (email.includes('admin') ? 'admin' : 'student');
        if (payload.data?.accessToken) {
          sessionStorage.setItem('we-access-token', payload.data.accessToken);
        }
        pushToast({
          tone: 'success',
          title: lang === 'vi' ? 'Đăng nhập thành công' : 'Signed in successfully',
        });
        setPreviewRole(role);
        navigate(`/${role}`);
        return;
      }

      if (res.status === 401 || res.status === 403 || res.status === 423) {
        const errPayload = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setErrorMsg(
          errPayload.error?.message ??
            (lang === 'vi' ? 'Email hoặc mật khẩu không đúng.' : 'Invalid credentials.'),
        );
        return;
      }

      pushToast({
        tone: 'neutral',
        title:
          lang === 'vi'
            ? 'Đã chuyển sang chế độ xem trước UI'
            : 'Entered UI Preview mode',
        description:
          lang === 'vi'
            ? 'Dùng nút chọn vai trò bên dưới hoặc trên thanh công cụ.'
            : 'Switch between Student, Teacher, and Admin portals anytime.',
      });
      setPreviewRole(email.includes('admin') ? 'admin' : 'student');
      navigate(email.includes('admin') ? '/admin' : '/student');
    } catch {
      pushToast({
        tone: 'neutral',
        title:
          lang === 'vi'
            ? 'Chế độ xem trước offline'
            : 'Offline UI preview ready',
      });
      setPreviewRole('student');
      navigate('/student');
    } finally {
      setLoading(false);
    }
  };

  const enterQuickRole = (role: 'student' | 'teacher' | 'admin') => {
    setPreviewRole(role);
    navigate(`/${role}`);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 sm:py-16">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-6 items-start">
        <Panel className="p-6 sm:p-7">
          <h1 className="text-2xl font-bold text-ink">{t('auth.loginTitle')}</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">{t('auth.loginSubtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {errorMsg && <ErrorNotice message={errorMsg} />}

            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-ink mb-1.5">
                {t('auth.email')}
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink focus:border-accent"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="text-xs font-semibold text-ink">
                  {t('auth.password')}
                </label>
                <Link
                  to="/auth/forgot-password"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {lang === 'vi' ? 'Quên mật khẩu?' : 'Forgot password?'}
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink focus:border-accent"
              />
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              <span>{loading ? '...' : t('auth.loginBtn')}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <p className="mt-5 text-xs text-ink-secondary text-center">
            {lang === 'vi' ? 'Chưa có tài khoản?' : "Don't have an account?"}{' '}
            <Link to="/auth/register" className="font-semibold text-accent hover:underline">
              {t('nav.register')}
            </Link>
          </p>
        </Panel>

        <Panel className="bg-rail p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>{t('auth.quickDemoHeading')}</span>
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {lang === 'vi'
              ? 'Chọn nhanh một vai trò để kiểm tra luồng đặt lịch, sổ cái buổi học, lộ trình cá nhân hoá và phòng học trực tuyến.'
              : 'Pick any role below to explore scheduling, session ledgers, personalized milestones, and the 1-on-1 classroom.'}
          </p>

          <div className="space-y-2">
            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={() => enterQuickRole('student')}
            >
              <span>{lang === 'vi' ? 'Học viên · Nguyễn Minh Anh (IELTS)' : 'Student · Minh Anh'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={() => enterQuickRole('teacher')}
            >
              <span>{lang === 'vi' ? 'Giáo viên · Ms. Sarah Jenkins' : 'Teacher · Sarah Jenkins'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-between"
              onClick={() => enterQuickRole('admin')}
            >
              <span>{lang === 'vi' ? 'Admin · Vận hành & Thanh toán' : 'Admin · Operations'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          <div className="pt-3 border-t border-hairline text-xs font-mono text-ink-muted">
            Seed admin (Phase 0 API): admin@example.com / Admin@123456
          </div>
        </Panel>
      </div>
    </div>
  );
}
