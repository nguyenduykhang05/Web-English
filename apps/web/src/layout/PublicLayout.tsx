import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Globe, Menu, Moon, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/Button';

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="h-7 w-7 rounded-[var(--radius-sm)] bg-ink-btn text-ink-btn-text flex items-center justify-center font-mono text-xs font-bold tracking-tight relative">
        WE
        <span
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent border border-canvas"
          aria-hidden="true"
        />
      </span>
      <span className="text-base font-bold tracking-tight text-ink">
        WebEnglish
      </span>
    </span>
  );
}

export default function PublicLayout() {
  const { t } = useTranslation();
  const { theme, toggleTheme, lang, toggleLang } = useUIStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh flex flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="shrink-0 focus-visible:rounded-[var(--radius-sm)]">
            <BrandMark />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-ink-secondary">
            <a href="/#how-it-works" className="hover:text-ink ui-transition">
              {t('nav.features')}
            </a>
            <a href="/#packages" className="hover:text-ink ui-transition">
              {t('nav.packages')}
            </a>
            <a href="/#teachers" className="hover:text-ink ui-transition">
              {t('nav.teachers')}
            </a>
            <Link to="/student" className="text-accent hover:text-accent-hover ui-transition">
              {t('nav.previewWorkspace')}
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              aria-label={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[var(--radius-sm)] text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink ui-transition cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono uppercase">{lang}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
              className="h-8 w-8 rounded-[var(--radius-sm)] flex items-center justify-center text-ink-secondary hover:bg-subtle hover:text-ink ui-transition cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <Link to="/auth/login">
              <Button variant="ghost" size="sm">
                {t('nav.login')}
              </Button>
            </Link>
            <Link to="/auth/register">
              <Button variant="primary" size="sm">
                {t('nav.register')}
              </Button>
            </Link>
          </div>

          <button
            type="button"
            className="md:hidden p-2 rounded-[var(--radius-sm)] text-ink-secondary hover:bg-subtle cursor-pointer"
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-hairline bg-surface px-4 py-4 space-y-3">
            <div className="flex flex-col gap-2 text-sm font-medium text-ink-secondary">
              <a
                href="/#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-ink"
              >
                {t('nav.features')}
              </a>
              <a
                href="/#packages"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-ink"
              >
                {t('nav.packages')}
              </a>
              <a
                href="/#teachers"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-ink"
              >
                {t('nav.teachers')}
              </a>
              <Link
                to="/student"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-accent font-semibold"
              >
                {t('nav.previewWorkspace')}
              </Link>
            </div>
            <div className="pt-3 border-t border-hairline flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={toggleLang}>
                  {lang.toUpperCase()}
                </Button>
                <Button variant="secondary" size="sm" onClick={toggleTheme}>
                  {theme === 'light' ? 'Dark' : 'Light'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm">
                    {t('nav.login')}
                  </Button>
                </Link>
                <Link to="/auth/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="sm">
                    {t('nav.register')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-hairline bg-rail">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="md:col-span-2 space-y-3">
            <BrandMark />
            <p className="text-ink-secondary max-w-md text-xs leading-relaxed">
              {lang === 'vi'
                ? 'Nền tảng học tiếng Anh trực tuyến 1 giáo viên – 1 học viên tại Việt Nam. Xây dựng trên triết lý minh bạch sổ cái buổi học, lộ trình cá nhân hoá theo 7 kỹ năng và sự đồng hành thực chất của giáo viên.'
                : 'Personalized 1-on-1 online English platform. Built around transparent session ledgers, 7-skill competency paths, and human-guided feedback.'}
            </p>
            <p className="font-mono text-xs text-ink-muted">
              Múi giờ mặc định: Asia/Ho_Chi_Minh (GMT+7)
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-ink">
              {lang === 'vi' ? 'Xem trước không gian' : 'Role Portals'}
            </p>
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li>
                <Link to="/student" className="hover:text-ink">
                  {t('roles.student')} · Workspace
                </Link>
              </li>
              <li>
                <Link to="/teacher" className="hover:text-ink">
                  {t('roles.teacher')} · Workspace
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-ink">
                  {t('roles.admin')} · Operations
                </Link>
              </li>
              <li>
                <Link to="/classroom/ses-101" className="hover:text-ink">
                  {t('sidebar.classroomPreview')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-ink">
              {lang === 'vi' ? 'Pháp lý & Riêng tư' : 'Legal & Privacy'}
            </p>
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li>
                <Link to="/legal/privacy" className="hover:text-ink">
                  {lang === 'vi' ? 'Chính sách bảo vệ dữ liệu' : 'Data Privacy Policy'}
                </Link>
              </li>
              <li>
                <Link to="/legal/terms" className="hover:text-ink">
                  {lang === 'vi' ? 'Điều khoản & Chính sách buổi học' : 'Terms & Session Policy'}
                </Link>
              </li>
              <li>
                <Link to="/auth/login" className="hover:text-ink">
                  {t('nav.login')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
