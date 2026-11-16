import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {
  vi: {
    translation: {
      appName: 'WebEnglish',
      tagline: 'Nền tảng tiếng Anh 1-1 cá nhân hoá',
      nav: {
        features: 'Phương pháp 1-1',
        packages: 'Khoá học & Gói',
        teachers: 'Giáo viên',
        previewWorkspace: 'Xem thử Workspace',
        login: 'Đăng nhập',
        register: 'Đăng ký học thử',
      },
      roles: {
        student: 'Học viên',
        teacher: 'Giáo viên',
        admin: 'Admin',
      },
      common: {
        timezoneLabel: 'Asia/Ho_Chi_Minh (GMT+7)',
        save: 'Lưu thay đổi',
        cancel: 'Huỷ bỏ',
        confirm: 'Xác nhận',
        close: 'Đóng',
        loading: 'Đang tải dữ liệu...',
        noDataTitle: 'Chưa có dữ liệu phù hợp',
        noDataHint: 'Thử thay đổi bộ lọc hoặc tạo mới mục đầu tiên.',
        retry: 'Thử lại',
        viewAll: 'Xem tất cả',
        aiProposedBadge: 'AI gợi ý · Chờ duyệt',
        demoModeBadge: 'Xem trước UI · Dữ liệu mẫu',
        sessionsUnit: 'buổi',
        logout: 'Đăng xuất',
      },
      auth: {
        loginTitle: 'Đăng nhập WebEnglish',
        loginSubtitle: 'Tiếp tục lộ trình tiếng Anh 1-1 và lịch học theo múi giờ GMT+7.',
        registerTitle: 'Tạo tài khoản & hồ sơ mục tiêu',
        registerSubtitle: 'Bắt đầu với 1 buổi đánh giá năng lực 7 kỹ năng miễn phí.',
        forgotTitle: 'Khôi phục mật khẩu',
        forgotSubtitle: 'Nhập email đã đăng ký để nhận liên kết đặt lại mật khẩu.',
        email: 'Email',
        password: 'Mật khẩu',
        fullName: 'Họ và tên',
        goal: 'Mục tiêu học tập chính',
        loginBtn: 'Đăng nhập',
        registerBtn: 'Đăng ký & nhận lịch học thử',
        sendResetBtn: 'Gửi liên kết đặt lại',
        quickDemoHeading: 'Hoặc vào nhanh bản xem trước theo vai trò',
      },
      sidebar: {
        studentDashboard: 'Tổng quan học tập',
        studentBooking: 'Đặt lịch 1-1',
        studentPath: 'Lộ trình cá nhân',
        studentProgress: 'Hồ sơ & 7 kỹ năng',
        studentHomework: 'Bài tập về nhà',
        studentVocab: 'Flashcard & SRS',
        studentLab: 'Dictation, Shadowing & IPA',
        studentBilling: 'Gói học & Hoá đơn',
        teacherDashboard: 'Tổng quan giảng dạy',
        teacherAvailability: 'Lịch rảnh hằng tuần',
        teacherStudents: 'Học viên & Phê duyệt',
        teacherReports: 'Báo cáo buổi học',
        teacherEarnings: 'Thu nhập dự kiến',
        adminDashboard: 'Vận hành hệ thống',
        adminEnrollments: 'Tuyển sinh & Thanh toán',
        adminCourses: 'Khoá học & Nhân sự',
        adminSettings: 'Chính sách & Audit',
        classroomPreview: 'Phòng học mẫu 1-1',
      },
    },
  },
  en: {
    translation: {
      appName: 'WebEnglish',
      tagline: 'Personalized 1-on-1 English Learning',
      nav: {
        features: '1-on-1 Method',
        packages: 'Packages',
        teachers: 'Teachers',
        previewWorkspace: 'Workspace Preview',
        login: 'Sign in',
        register: 'Book free trial',
      },
      roles: {
        student: 'Student',
        teacher: 'Teacher',
        admin: 'Admin',
      },
      common: {
        timezoneLabel: 'Asia/Ho_Chi_Minh (GMT+7)',
        save: 'Save changes',
        cancel: 'Cancel',
        confirm: 'Confirm',
        close: 'Close',
        loading: 'Loading...',
        noDataTitle: 'No matching records',
        noDataHint: 'Adjust your filters or add a new item to get started.',
        retry: 'Retry',
        viewAll: 'View all',
        aiProposedBadge: 'AI proposed · Review required',
        demoModeBadge: 'UI Preview · Sample Ledger',
        sessionsUnit: 'sessions',
        logout: 'Sign out',
      },
      auth: {
        loginTitle: 'Sign in to WebEnglish',
        loginSubtitle: 'Continue your personalized 1-on-1 track and GMT+7 bookings.',
        registerTitle: 'Create learner profile',
        registerSubtitle: 'Start with a free 7-skill CEFR baseline trial session.',
        forgotTitle: 'Reset password',
        forgotSubtitle: 'Enter your registered email to receive a secure reset link.',
        email: 'Email address',
        password: 'Password',
        fullName: 'Full name',
        goal: 'Primary learning goal',
        loginBtn: 'Sign in',
        registerBtn: 'Create account & book trial',
        sendResetBtn: 'Send reset link',
        quickDemoHeading: 'Or preview immediately by role',
      },
      sidebar: {
        studentDashboard: 'Learning Overview',
        studentBooking: 'Book 1-on-1',
        studentPath: 'Learning Path',
        studentProgress: '7-Skill Profile',
        studentHomework: 'Homework',
        studentVocab: 'Flashcards & SRS',
        studentLab: 'Dictation, Shadowing & IPA',
        studentBilling: 'Packages & Billing',
        teacherDashboard: 'Teaching Overview',
        teacherAvailability: 'Weekly Availability',
        teacherStudents: 'Students & Approvals',
        teacherReports: 'Session Reports',
        teacherEarnings: 'Estimated Payout',
        adminDashboard: 'Operations & Alerts',
        adminEnrollments: 'Enrollments & Payments',
        adminCourses: 'Courses & Directory',
        adminSettings: 'Policies & Audit Log',
        classroomPreview: '1-on-1 Classroom',
      },
    },
  },
} as const;

const savedLang = (() => {
  try {
    const val = localStorage.getItem('we-lang');
    return val === 'en' || val === 'vi' ? val : 'vi';
  } catch {
    return 'vi';
  }
})();

void i18n.use(initReactI18next).init({
  resources,
  lng: savedLang,
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
});

export default i18n;
