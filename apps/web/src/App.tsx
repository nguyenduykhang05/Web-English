import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicLayout from './layout/PublicLayout';
import AppShell from './layout/AppShell';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';
import { PrivacyPolicyPage, TermsPolicyPage } from './pages/LegalPages';
import { ErrorNotice, LoadingSkeleton } from './components/ui/States';
import { ToastViewport } from './components/ui/ToastViewport';

const StudentDashboardPage = lazy(() => import('./pages/student/StudentDashboardPage'));
const BookingPage = lazy(() => import('./pages/student/BookingPage'));
const LearningPathPage = lazy(() => import('./pages/student/LearningPathPage'));
const ProgressPage = lazy(() => import('./pages/student/ProgressPage'));
const HomeworkPage = lazy(() => import('./pages/student/HomeworkPage'));
const VocabPracticePage = lazy(() => import('./pages/student/VocabPracticePage'));
const AudioLabPage = lazy(() => import('./pages/student/AudioLabPage'));
const BillingPage = lazy(() => import('./pages/student/BillingPage'));

const TeacherDashboardPage = lazy(() => import('./pages/teacher/TeacherDashboardPage'));
const TeacherAvailabilityPage = lazy(() => import('./pages/teacher/TeacherAvailabilityPage'));
const TeacherStudentsPage = lazy(() => import('./pages/teacher/TeacherStudentsPage'));
const TeacherReportsPage = lazy(() =>
  import('./pages/teacher/TeacherReportsPage').then((m) => ({ default: m.TeacherReportsPage })),
);
const TeacherEarningsPage = lazy(() =>
  import('./pages/teacher/TeacherReportsPage').then((m) => ({ default: m.TeacherEarningsPage })),
);

const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminEnrollmentsPage = lazy(() => import('./pages/admin/AdminEnrollmentsPage'));
const AdminCoursesPage = lazy(() => import('./pages/admin/AdminCoursesPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));

const ClassroomPage = lazy(() => import('./pages/classroom/ClassroomPage'));

function PageFallback() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <LoadingSkeleton rows={4} />
    </div>
  );
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { errorMessage: string | null }
> {
  state: { errorMessage: string | null } = { errorMessage: null };

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error.message || 'Lỗi hiển thị giao diện' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <ErrorNotice
            message={`Không thể hiển thị trang: ${this.state.errorMessage}`}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public & Auth Routes */}
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="auth/login" element={<LoginPage />} />
            <Route path="auth/register" element={<RegisterPage />} />
            <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="legal/privacy" element={<PrivacyPolicyPage />} />
            <Route path="legal/terms" element={<TermsPolicyPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
          </Route>

          {/* Student Portal */}
          <Route path="/student" element={<AppShell forcedRole="student" />}>
            <Route index element={<StudentDashboardPage />} />
            <Route path="booking" element={<BookingPage />} />
            <Route path="path" element={<LearningPathPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="homework" element={<HomeworkPage />} />
            <Route path="vocab" element={<VocabPracticePage />} />
            <Route path="lab" element={<AudioLabPage />} />
            <Route path="billing" element={<BillingPage />} />
          </Route>

          {/* Teacher Portal */}
          <Route path="/teacher" element={<AppShell forcedRole="teacher" />}>
            <Route index element={<TeacherDashboardPage />} />
            <Route path="availability" element={<TeacherAvailabilityPage />} />
            <Route path="students" element={<TeacherStudentsPage />} />
            <Route path="reports" element={<TeacherReportsPage />} />
            <Route path="earnings" element={<TeacherEarningsPage />} />
          </Route>

          {/* Admin Operations */}
          <Route path="/admin" element={<AppShell forcedRole="admin" />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="enrollments" element={<AdminEnrollmentsPage />} />
            <Route path="courses" element={<AdminCoursesPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>

          {/* Standalone 1-on-1 Live Classroom */}
          <Route path="/classroom/:sessionId" element={<ClassroomPage />} />

          {/* Fallback */}
          <Route element={<PublicLayout />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastViewport />
    </AppErrorBoundary>
  );
}
