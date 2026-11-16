import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import PublicLayout from './layout/PublicLayout';
import AppShell from './layout/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import StudentDashboardPage from './pages/student/StudentDashboardPage';
import BookingPage from './pages/student/BookingPage';
import LearningPathPage from './pages/student/LearningPathPage';
import ProgressPage from './pages/student/ProgressPage';
import HomeworkPage from './pages/student/HomeworkPage';
import VocabPracticePage from './pages/student/VocabPracticePage';
import AudioLabPage from './pages/student/AudioLabPage';
import BillingPage from './pages/student/BillingPage';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import TeacherAvailabilityPage from './pages/teacher/TeacherAvailabilityPage';
import TeacherStudentsPage from './pages/teacher/TeacherStudentsPage';
import { TeacherEarningsPage, TeacherReportsPage } from './pages/teacher/TeacherReportsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminEnrollmentsPage from './pages/admin/AdminEnrollmentsPage';
import AdminCoursesPage from './pages/admin/AdminCoursesPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import ClassroomPage from './pages/classroom/ClassroomPage';
import { PrivacyPolicyPage, TermsPolicyPage } from './pages/LegalPages';
import NotFoundPage from './pages/NotFoundPage';

function renderRoute(element: React.ReactElement, initialEntry = '/') {
  return renderToString(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>
    </I18nextProvider>,
  );
}

describe('WebEnglish UI route render smoke tests', () => {
  it('renders public & auth screens without runtime errors', () => {
    expect(renderRoute(<PublicLayout />)).toContain('WebEnglish');
    expect(renderRoute(<LandingPage />)).toContain('Học tiếng Anh 1-1');
    expect(renderRoute(<LoginPage />)).toContain('Đăng nhập');
    expect(renderRoute(<RegisterPage />)).toContain('Chính sách bảo vệ dữ liệu');
    expect(renderRoute(<ForgotPasswordPage />)).toContain('Khôi phục mật khẩu');
    expect(renderRoute(<PrivacyPolicyPage />)).toContain('Học viên dưới 18 tuổi');
    expect(renderRoute(<TermsPolicyPage />)).toContain('sessionLedger');
    expect(renderRoute(<NotFoundPage />)).toContain('404');
  });

  it('renders student, teacher, admin, and classroom screens cleanly', () => {
    expect(renderRoute(<AppShell forcedRole="student" />)).toContain('Nguyễn Minh Anh');
    expect(renderRoute(<StudentDashboardPage />)).toContain('14');
    expect(renderRoute(<BookingPage />)).toContain('Ms. Sarah Jenkins');
    expect(renderRoute(<LearningPathPage />)).toContain('AI gợi ý');
    expect(renderRoute(<ProgressPage />)).toContain('Hồ sơ năng lực');
    expect(renderRoute(<HomeworkPage />)).toContain('Bài tập về nhà');
    expect(renderRoute(<VocabPracticePage />)).toContain('Flashcard');
    expect(renderRoute(<AudioLabPage />)).toContain('IPA');
    expect(renderRoute(<BillingPage />)).toContain('WE-INV-2026-0412');

    expect(renderRoute(<AppShell forcedRole="teacher" />)).toContain('Ms. Sarah Jenkins');
    expect(renderRoute(<TeacherDashboardPage />)).toContain('Thu nhập tạm tính');
    expect(renderRoute(<TeacherAvailabilityPage />)).toContain('America/New_York');
    expect(renderRoute(<TeacherStudentsPage />)).toContain('Phê duyệt lộ trình');
    expect(renderRoute(<TeacherReportsPage />)).toContain('Báo cáo sau buổi học');
    expect(renderRoute(<TeacherEarningsPage />)).toContain('Thù lao');

    expect(renderRoute(<AppShell forcedRole="admin" />)).toContain('Admin');
    expect(renderRoute(<AdminDashboardPage />)).toContain('Cảnh báo vận hành');
    expect(renderRoute(<AdminEnrollmentsPage />)).toContain('Xác nhận đã nhận tiền');
    expect(renderRoute(<AdminCoursesPage />)).toContain('Mời giáo viên mới');
    expect(renderRoute(<AdminSettingsPage />)).toContain('Audit');

    expect(renderRoute(<ClassroomPage />, '/classroom/ses-101')).toContain('MeetingProvider');
  });
});
