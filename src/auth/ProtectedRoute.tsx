import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children, superadminOnly = false }: { children: React.ReactNode; superadminOnly?: boolean }) {
  const { user, loading, isSuperadmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading">Opening the ledger…</div>;
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (superadminOnly && !isSuperadmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
