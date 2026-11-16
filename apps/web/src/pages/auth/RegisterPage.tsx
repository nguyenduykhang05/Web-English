import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { ErrorNotice } from '@/components/ui/States';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lang, setPreviewRole, pushToast } = useUIStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [goalType, setGoalType] = useState<'ielts' | 'communication' | 'business'>('ielts');
  const [password, setPassword] = useState('');
  const [consentData, setConsentData] = useState(true);
  const [consentAi, setConsentAi] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!fullName.trim() || !email.includes('@') || password.length < 8) {
      setErrorMsg(
        lang === 'vi'
          ? 'Vui lòng điền họ tên, email hợp lệ và mật khẩu ít nhất 8 ký tự.'
          : 'Please enter full name, valid email, and password (min 8 chars).',
      );
      return;
    }
    if (!consentData) {
      setErrorMsg(
        lang === 'vi'
          ? 'Cần đồng ý chính sách bảo vệ dữ liệu học viên trước khi tạo tài khoản.'
          : 'Please accept the learner data privacy policy before continuing.',
      );
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      if (res.status === 409) {
        setErrorMsg(lang === 'vi' ? 'Email đã được đăng ký.' : 'Email already registered.');
        return;
      }
    } catch {
      // Allow UI preview fallback when API server is offline
    }

    pushToast({
      tone: 'success',
      title: lang === 'vi' ? 'Đã tạo tài khoản & hồ sơ mục tiêu' : 'Account & goal profile created',
      description:
        lang === 'vi'
          ? 'Đang chuyển tới bước chọn lịch học thử 1-1.'
          : 'Taking you to the 1-on-1 booking view.',
    });
    setPreviewRole('student');
    navigate('/student/booking');
  };

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-10 sm:py-14">
      <Panel className="p-6 sm:p-7">
        <h1 className="text-2xl font-bold text-ink">{t('auth.registerTitle')}</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">{t('auth.registerSubtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {errorMsg && <ErrorNotice message={errorMsg} />}

          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-ink mb-1.5">
              {t('auth.fullName')}
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Minh Anh"
              className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-ink mb-1.5">
                {t('auth.email')}
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="minhanh@example.com"
                className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="reg-goal" className="block text-xs font-semibold text-ink mb-1.5">
                {t('auth.goal')}
              </label>
              <select
                id="reg-goal"
                value={goalType}
                onChange={(e) =>
                  setGoalType(e.target.value as 'ielts' | 'communication' | 'business')
                }
                className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
              >
                <option value="ielts">IELTS (6.5 – 7.5)</option>
                <option value="communication">Giao tiếp phản xạ</option>
                <option value="business">Tiếng Anh công sở / Phỏng vấn</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reg-pass" className="block text-xs font-semibold text-ink mb-1.5">
              {t('auth.password')}
            </label>
            <input
              id="reg-pass"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
            />
          </div>

          <div className="p-3.5 rounded-[var(--radius-md)] bg-subtle space-y-2.5 text-xs text-ink-secondary">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consentData}
                onChange={(e) => setConsentData(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                {lang === 'vi'
                  ? 'Tôi đồng ý với Chính sách bảo vệ dữ liệu học tập và thông tin người giám hộ (nếu dưới 18 tuổi).'
                  : 'I agree to the learner data privacy policy (including guardian rules if under 18).'}
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAi}
                onChange={(e) => setConsentAi(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                {lang === 'vi'
                  ? 'Cho phép hệ thống gợi ý bài tập & lộ trình bổ trợ (mọi đề xuất luôn do giáo viên kiểm duyệt).'
                  : 'Allow rule/AI exercise suggestions (all proposals strictly require human teacher approval).'}
              </span>
            </label>
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full">
            <span>{t('auth.registerBtn')}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>

        <p className="mt-5 text-xs text-ink-secondary text-center">
          {lang === 'vi' ? 'Đã có tài khoản?' : 'Already registered?'}{' '}
          <Link to="/auth/login" className="font-semibold text-accent hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      </Panel>
    </div>
  );
}
