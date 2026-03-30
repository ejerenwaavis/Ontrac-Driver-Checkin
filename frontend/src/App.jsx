import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';

// Pages
import Login from './pages/Login.jsx';
import MFASetup from './pages/MFASetup.jsx';
import Scanner from './pages/Scanner.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Drivers from './pages/Drivers.jsx';
import Admissions from './pages/Admissions.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-soft">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/mfa-setup" element={<MFASetup />} />

      {/* Protected — all roles */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/scanner" replace />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/settings" element={<Settings />} />

          {/* Admin + Supervisor */}
          <Route element={<ProtectedRoute roles={['admin', 'supervisor']} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admissions" element={<Admissions />} />
            <Route path="/drivers" element={<Drivers />} />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
