import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { userCan } from '@/lib/access';
import type { Permission } from '@/lib/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Any-of permission list required to view this route. */
  anyOf?: Permission[] | null;
}

export function ProtectedRoute({ children, anyOf }: ProtectedRouteProps) {
  const { isAuthenticated, currentUser, loading } = useAuthStore();

  // Still resolving session — render nothing (App.tsx shows the spinner)
  if (loading) return null;

  if (!isAuthenticated || !currentUser) {
    return <Navigate to="/login" replace />;
  }

  // Permission-gated route: bounce to dashboard if not allowed
  if (anyOf !== undefined && !userCan(currentUser, anyOf)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
