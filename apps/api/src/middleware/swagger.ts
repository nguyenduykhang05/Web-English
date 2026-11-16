import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const definition = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'WebEnglish 1-1 Platform API',
      version: '0.6.0',
      description:
        'Backend API cho nền tảng dạy & học tiếng Anh 1-1 trực tuyến (SessionLedger ACID, đặt lịch 1-1, lớp học Socket.IO, báo cáo & bảng lương, lộ trình cá nhân hóa & AI đề xuất).',
    },
    servers: [
      { url: '/api/v1', description: 'API v1 (relative proxy/origin)' },
      { url: 'http://localhost:4000/api/v1', description: 'Local API server' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Đăng ký, đăng nhập, refresh token và hồ sơ tài khoản' },
      { name: 'Students', description: 'Hồ sơ học viên, trình độ CEFR, mục tiêu & ghi chú 1-1' },
      { name: 'Teachers', description: 'Hồ sơ giáo viên, lịch rảnh & gợi ý ghép đôi Top-5' },
      { name: 'Courses', description: 'Khóa học, gói buổi học & mã giảm giá' },
      { name: 'Enrollments', description: 'Đăng ký khóa học, hóa đơn VietQR/VNPay, xác nhận/hoàn tiền & SessionLedger' },
      { name: 'Sessions', description: 'Tính slot theo timezone, đặt lịch/đổi/hủy, file ICS & lớp học trực tuyến' },
      { name: 'Notifications', description: 'Trung tâm thông báo in-app & lịch sử gửi' },
      { name: 'Reports', description: 'Báo cáo sau buổi học, EMA kỹ năng & đánh giá học viên' },
      { name: 'Quality', description: 'Cảnh báo chất lượng & can thiệp giảng dạy' },
      { name: 'Payrolls', description: 'Bảng lương giáo viên theo tháng & xuất CSV' },
      { name: 'Dashboards', description: 'Tổng hợp số liệu 3 Dashboard (Học viên, Giáo viên, Admin)' },
      { name: 'LearningPaths', description: 'Kiểm tra đầu vào thích ứng, lộ trình & phê duyệt đề xuất rule/AI' },
      { name: 'Curriculum', description: 'Kho bài học tuyển chọn & bài tập 5 dạng' },
      { name: 'Practice', description: 'Flashcard SRS, đồng bộ từ vựng 1-1, Dictation/Shadowing & Bảng IPA 44 âm' },
      { name: 'AI', description: '8 tính năng AI đề xuất (consent, PII redaction, rate-limit & audit logs)' },
      { name: 'Settings', description: 'Cấu hình chính sách hệ thống động & Audit logs' },
    ],
  },
  apis: ['./src/modules/**/*.ts', './src/app.ts'],
});

export function registerSwagger(app: import('express').Express) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(definition));
}
