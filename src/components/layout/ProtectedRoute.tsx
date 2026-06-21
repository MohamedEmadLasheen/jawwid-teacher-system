import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import type { Permission } from '@/lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
}

export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, currentUser, needsSetup, loading } = useAuthStore();

  // Still resolving session — render nothing (App.tsx shows the spinner)
  if (loading) return null;

  if (needsSetup) return <Navigate to="/setup" replace />;

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermission && !currentUser.permissions.includes(requiredPermission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
