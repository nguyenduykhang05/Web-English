import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { useUIStore } from '@/stores/useUIStore';

export default function NotFoundPage() {
  const lang = useUIStore((s) => s.lang);
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Panel className="p-8 text-center space-y-4">
        <p className="font-mono text-2xl font-bold text-ink">404</p>
        <h1 className="text-xl font-bold text-ink">
          {lang === 'vi' ? 'Không tìm thấy trang này' : 'Page not found'}
        </h1>
        <p className="text-sm text-ink-secondary">
          {lang === 'vi'
            ? 'Đường dẫn bạn truy cập không tồn tại hoặc đã được di chuyển.'
            : 'The requested route does not exist or has been moved.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link to="/">
            <Button variant="primary" size="sm">
              {lang === 'vi' ? 'Về trang chủ' : 'Back home'}
            </Button>
          </Link>
          <Link to="/student">
            <Button variant="secondary" size="sm">
              {lang === 'vi' ? 'Mở Portal Học viên' : 'Open Student Portal'}
            </Button>
          </Link>
        </div>
      </Panel>
    </div>
  );
}
