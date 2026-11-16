import { Link } from 'react-router-dom';
import { Panel } from '@/components/ui/Panel';
import { useUIStore } from '@/stores/useUIStore';

export function PrivacyPolicyPage() {
  const lang = useUIStore((s) => s.lang);
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <Panel className="p-6 sm:p-8 space-y-5">
        <h1 className="text-2xl font-bold text-ink">
          {lang === 'vi'
            ? 'Chính sách Bảo vệ Dữ liệu & Riêng tư Học viên'
            : 'Learner Data Privacy & Protection Policy'}
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {lang === 'vi'
            ? 'WebEnglish áp dụng nguyên tắc tối thiểu hoá dữ liệu và kiểm soát quyền theo từng vai trò (Học viên, Giáo viên được phân công, Admin). Giáo viên chỉ xem được hồ sơ năng lực và ghi chú học tập của học viên đang có enrollment trực tiếp.'
            : 'WebEnglish enforces data minimization and resource-level authorization. Teachers only access competency profiles and lesson notes for assigned active enrollments.'}
        </p>
        <div className="space-y-3 text-sm text-ink-secondary">
          <h2 className="text-base font-bold text-ink">
            {lang === 'vi' ? '1. Học viên dưới 18 tuổi' : '1. Minor learner safeguards'}
          </h2>
          <p className="leading-relaxed">
            {lang === 'vi'
              ? 'Học viên dưới 18 tuổi yêu cầu thông tin người giám hộ hợp pháp và đồng ý rõ ràng trước khi tham gia lớp học trực tuyến hoặc xử lý gợi ý lộ trình tự động.'
              : 'Learners under 18 require legal guardian contact details and explicit consent prior to attending 1-on-1 video sessions or enabling automated study suggestions.'}
          </p>
          <h2 className="text-base font-bold text-ink">
            {lang === 'vi' ? '2. Đề xuất từ AI' : '2. Human-in-the-loop AI transparency'}
          </h2>
          <p className="leading-relaxed">
            {lang === 'vi'
              ? 'Mọi đề xuất bài tập hoặc điều chỉnh chặng học do AI tạo ra luôn gắn nhãn chờ duyệt (proposed) và chỉ có hiệu lực khi được giáo viên hoặc admin xác nhận.'
              : 'All AI-assisted path or homework recommendations stay in a proposed state and take effect only upon explicit teacher or admin sign-off.'}
          </p>
        </div>
        <div className="pt-4 border-t border-hairline">
          <Link to="/" className="text-sm font-semibold text-accent hover:underline">
            {lang === 'vi' ? '← Quay lại trang chủ' : '← Back to home'}
          </Link>
        </div>
      </Panel>
    </div>
  );
}

export function TermsPolicyPage() {
  const lang = useUIStore((s) => s.lang);
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <Panel className="p-6 sm:p-8 space-y-5">
        <h1 className="text-2xl font-bold text-ink">
          {lang === 'vi'
            ? 'Điều khoản & Chính sách Buổi học 1-1'
            : 'Terms & 1-on-1 Session Ledger Policy'}
        </h1>
        <div className="space-y-3 text-sm text-ink-secondary leading-relaxed">
          <p>
            {lang === 'vi'
              ? '1. Sổ cái buổi học (sessionLedger) ghi nhận toàn bộ lượt cộng buổi khi xác nhận thanh toán, trừ buổi khi giữ lịch và hoàn buổi khi huỷ/đổi hợp lệ.'
              : '1. The sessionLedger serves as the sole source of truth for remaining credits, debits on booking, and policy-backed refunds.'}
          </p>
          <p>
            {lang === 'vi'
              ? '2. Ngưỡng huỷ/đổi lịch miễn phí mặc định là 12 giờ trước giờ bắt đầu (Asia/Ho_Chi_Minh). Các ngưỡng này được cấu hình linh hoạt tại Settings.'
              : '2. Free cancellations and rescheduling default to 12 hours prior to session start (GMT+7) and are configurable in platform settings.'}
          </p>
        </div>
        <div className="pt-4 border-t border-hairline">
          <Link to="/" className="text-sm font-semibold text-accent hover:underline">
            {lang === 'vi' ? '← Quay lại trang chủ' : '← Back to home'}
          </Link>
        </div>
      </Panel>
    </div>
  );
}
