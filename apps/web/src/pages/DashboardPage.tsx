import { Navigate } from 'react-router-dom';
import { useUIStore } from '@/stores/useUIStore';

export default function DashboardPage() {
  const previewRole = useUIStore((s) => s.previewRole);
  return <Navigate to={`/${previewRole}`} replace />;
}
