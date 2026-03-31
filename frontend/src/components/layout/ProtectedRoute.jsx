import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

export default function ProtectedRoute({ roles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Redirect to fastest permitted page rather than a blank 403
    return <Navigate to="/scanner" replace />;
  }

  // Force password change blocks access to everything except /settings
  if (user.forcePasswordChange && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }

  return <Outlet />;
}
