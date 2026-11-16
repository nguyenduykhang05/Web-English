import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileText,
  Globe,
  Headphones,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Video,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { usePlatformStore } from '@/stores/usePlatformStore';
import type { UserRole } from '@/types/domain';
import { BrandMark } from './PublicLayout';

interface NavEntry {
  to: string;
  labelKey: string;
  icon: ReactNode;
  end?: boolean;
}

const ROLE_NAV: Record<UserRole, NavEntry[]> = {
  student: [
    { to: '/student', labelKey: 'sidebar.studentDashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: '/student/booking', labelKey: 'sidebar.studentBooking', icon: <CalendarPlus className="h-4 w-4" /> },
    { to: '/student/path', labelKey: 'sidebar.studentPath', icon: <RouteIcon className="h-4 w-4" /> },
    { to: '/student/progress', labelKey: 'sidebar.studentProgress', icon: <Activity className="h-4 w-4" /> },
    { to: '/student/homework', labelKey: 'sidebar.studentHomework', icon: <BookOpen className="h-4 w-4" /> },
    { to: '/student/vocab', labelKey: 'sidebar.studentVocab', icon: <Layers className="h-4 w-4" /> },
    { to: '/student/lab', labelKey: 'sidebar.studentLab', icon: <Headphones className="h-4 w-4" /> },
    { to: '/student/billing', labelKey: 'sidebar.studentBilling', icon: <Receipt className="h-4 w-4" /> },
  ],
  teacher: [
    { to: '/teacher', labelKey: 'sidebar.teacherDashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: '/teacher/availability', labelKey: 'sidebar.teacherAvailability', icon: <CalendarClock className="h-4 w-4" /> },
    { to: '/teacher/students', labelKey: 'sidebar.teacherStudents', icon: <Users className="h-4 w-4" /> },
    { to: '/teacher/reports', labelKey: 'sidebar.teacherReports', icon: <ClipboardCheck className="h-4 w-4" /> },
    { to: '/teacher/earnings', labelKey: 'sidebar.teacherEarnings', icon: <Wallet className="h-4 w-4" /> },
  ],
  admin: [
    { to: '/admin', labelKey: 'sidebar.adminDashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: '/admin/enrollments', labelKey: 'sidebar.adminEnrollments', icon: <CreditCard className="h-4 w-4" /> },
    { to: '/admin/courses', labelKey: 'sidebar.adminCourses', icon: <Award className="h-4 w-4" /> },
    { to: '/admin/settings', labelKey: 'sidebar.adminSettings', icon: <Settings className="h-4 w-4" /> },
  ],
};

const ROLE_HOME: Record<UserRole, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

const ROLE_IDENTITY: Record<UserRole, { name: string; subtitle: string; initials: string }> = {
  student: { name: 'Nguyễn Minh Anh', subtitle: 'CEFR B1 · Mục tiêu IELTS 7.0', initials: 'MA' },
  teacher: { name: 'Ms. Sarah Jenkins', subtitle: 'Giáo viên 1-1 · EST (GMT-5)', initials: 'SJ' },
  admin: { name: 'Trần Linh Chi', subtitle: 'Academic Ops · Admin', initials: 'LC' },
};

export default function AppShell({ forcedRole }: { forcedRole?: UserRole }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    theme,
    toggleTheme,
    lang,
    toggleLang,
    previewRole,
    setPreviewRole,
    sidebarCollapsed,
    toggleSidebar,
    mobileNavOpen,
    setMobileNavOpen,
  } = useUIStore();
  const { notifications, markAllNotificationsRead } = usePlatformStore();
  const [notifOpen, setNotifOpen] = useState(false);

  const activeRole: UserRole = forcedRole ?? previewRole;
  const navItems = ROLE_NAV[activeRole];
  const persona = ROLE_IDENTITY[activeRole];
  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleRoleSwitch = (nextRole: UserRole) => {
    setPreviewRole(nextRole);
    navigate(ROLE_HOME[nextRole]);
    setMobileNavOpen(false);
  };

  const renderRailContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-rail text-ink">
      <div className="h-14 px-4 flex items-center justify-between border-b border-hairline shrink-0">
        {(!sidebarCollapsed || isMobile) && (
          <Link to="/" className="focus-visible:rounded-[var(--radius-sm)]">
            <BrandMark />
          </Link>
        )}
        {!isMobile ? (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            className="p-1.5 rounded-[var(--radius-sm)] text-ink-muted hover:text-ink hover:bg-hover ui-transition cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Đóng thanh điều hướng"
            className="p-1.5 rounded-[var(--radius-sm)] text-ink-muted hover:text-ink hover:bg-hover cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {(!sidebarCollapsed || isMobile) && (
        <div className="px-3 pt-4 pb-2">
          <div className="px-3 py-2.5 rounded-[var(--radius-md)] bg-surface border border-hairline flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-subtle border border-hairline flex items-center justify-center font-mono text-xs font-bold text-ink shrink-0">
              {persona.initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink truncate">{persona.name}</p>
              <p className="text-xs text-ink-muted truncate">{persona.subtitle}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto" aria-label="Điều hướng vai trò">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => isMobile && setMobileNavOpen(false)}
            title={sidebarCollapsed && !isMobile ? t(item.labelKey) : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium ui-transition',
                isActive
                  ? 'bg-surface text-ink border border-hairline font-semibold'
                  : 'text-ink-secondary hover:bg-hover hover:text-ink border border-transparent',
                sidebarCollapsed && !isMobile && 'justify-center px-2',
              )
            }
          >
            <span className="shrink-0">{item.icon}</span>
            {(!sidebarCollapsed || isMobile) && (
              <span className="truncate">{t(item.labelKey)}</span>
            )}
          </NavLink>
        ))}

        <div className="pt-3 mt-3 border-t border-hairline">
          <NavLink
            to="/classroom/ses-101"
            onClick={() => isMobile && setMobileNavOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium ui-transition',
                isActive
                  ? 'bg-accent-soft text-accent border border-accent-border font-semibold'
                  : 'text-accent hover:bg-accent-soft/60 border border-transparent',
                sidebarCollapsed && !isMobile && 'justify-center px-2',
              )
            }
          >
            <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
            {(!sidebarCollapsed || isMobile) && (
              <span className="truncate">{t('sidebar.classroomPreview')}</span>
            )}
          </NavLink>
        </div>
      </nav>

      <div className="p-3 border-t border-hairline space-y-2 shrink-0">
        {(!sidebarCollapsed || isMobile) && (
          <div className="px-2.5 py-2 rounded-[var(--radius-sm)] bg-subtle text-xs text-ink-secondary flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-accent shrink-0" aria-hidden="true" />
            <span className="truncate">{t('common.demoModeBadge')}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-1">
          <Link
            to="/"
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-ink-secondary hover:bg-hover hover:text-ink ui-transition',
              sidebarCollapsed && !isMobile && 'w-full justify-center px-1',
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {(!sidebarCollapsed || isMobile) && <span>Landing</span>}
          </Link>
          {(!sidebarCollapsed || isMobile) && (
            <Link
              to="/auth/login"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-ink-muted hover:bg-hover hover:text-ink ui-transition"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('common.logout')}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh flex bg-canvas text-ink">
      {/* Desktop Left Rail */}
      <aside
        className={cn(
          'hidden lg:block shrink-0 border-r border-hairline sticky top-0 h-dvh ui-transition',
          sidebarCollapsed ? 'w-[68px]' : 'w-[252px]',
        )}
      >
        {renderRailContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-ink/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full border-r border-hairline bg-rail z-10">
            {renderRailContent(true)}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Utility Header */}
        <header className="sticky top-0 z-30 h-14 border-b border-hairline bg-canvas/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-1.5 rounded-[var(--radius-sm)] text-ink-secondary hover:bg-subtle cursor-pointer"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            {/* Role Preview Switcher */}
            <div
              role="group"
              aria-label="Chuyển đổi không gian vai trò"
              className="inline-flex items-center p-0.5 rounded-[var(--radius-md)] bg-subtle border border-hairline"
            >
              {(['student', 'teacher', 'admin'] as const).map((roleOption) => {
                const selected = activeRole === roleOption;
                return (
                  <button
                    key={roleOption}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleRoleSwitch(roleOption)}
                    className={cn(
                      'px-2.5 sm:px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium ui-transition cursor-pointer',
                      selected
                        ? 'bg-surface text-ink font-semibold border border-hairline'
                        : 'text-ink-muted hover:text-ink border border-transparent',
                    )}
                  >
                    {t(`roles.${roleOption}`)}
                  </button>
                );
              })}
            </div>

            <span className="hidden xl:inline-flex items-center gap-1.5 text-xs font-mono text-ink-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              GMT+7 · {location.pathname}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-full)] bg-subtle text-xs font-mono text-ink-secondary">
              GMT+7
            </span>

            <button
              type="button"
              onClick={toggleLang}
              aria-label={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
              className="inline-flex items-center gap-1 h-8 px-2 rounded-[var(--radius-sm)] text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink ui-transition cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono uppercase">{lang}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Bật giao diện tối' : 'Bật giao diện sáng'}
              className="h-8 w-8 rounded-[var(--radius-sm)] flex items-center justify-center text-ink-secondary hover:bg-subtle hover:text-ink ui-transition cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Thông báo"
                aria-expanded={notifOpen}
                className="relative h-8 w-8 rounded-[var(--radius-sm)] flex items-center justify-center text-ink-secondary hover:bg-subtle hover:text-ink ui-transition cursor-pointer"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] bg-surface border border-hairline-strong surface-popover p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-hairline">
                    <span className="text-xs font-bold text-ink">
                      {lang === 'vi' ? 'Thông báo gần đây' : 'Recent notifications'}
                    </span>
                    <button
                      type="button"
                      onClick={() => markAllNotificationsRead()}
                      className="text-xs font-medium text-accent hover:underline cursor-pointer"
                    >
                      {lang === 'vi' ? 'Đánh dấu đã đọc' : 'Mark all read'}
                    </button>
                  </div>
                  <div className="divide-y divide-hairline mt-1">
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          navigate(item.targetPath);
                        }}
                        className="w-full text-left py-2.5 px-2 rounded-[var(--radius-sm)] hover:bg-subtle ui-transition cursor-pointer flex items-start gap-2"
                      >
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 rounded-full shrink-0',
                            item.unread ? 'bg-accent' : 'bg-transparent',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink leading-snug">
                            {item.title}
                          </p>
                          <p className="text-xs text-ink-muted mt-0.5 font-mono">
                            {item.timeLabel}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
