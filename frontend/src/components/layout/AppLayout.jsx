import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ScanBarcode, LayoutDashboard, Users, Truck, ClipboardList,
  Settings, LogOut, Menu, X, ChevronRight, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import toast from 'react-hot-toast';

const navItems = [
  { to: '/scanner',    icon: ScanBarcode,    label: 'Scanner',    roles: ['admin', 'supervisor', 'clerk'] },
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',  roles: ['admin', 'supervisor'] },
  { to: '/admissions', icon: ClipboardList,  label: 'Admissions', roles: ['admin', 'supervisor'] },
  { to: '/drivers',    icon: Truck,          label: 'Drivers',    roles: ['admin', 'supervisor'] },
  { to: '/users',      icon: Users,          label: 'Users',      roles: ['admin'] },
  { to: '/settings',   icon: Settings,       label: 'Settings',   roles: ['admin', 'supervisor', 'clerk'] },
];

const roleBadge = { admin: 'badge-admin', supervisor: 'badge-supervisor', clerk: 'badge-clerk' };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const visibleNav = navItems.filter((n) => n.roles.includes(user?.role));

  const NavContent = () => (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-border">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight truncate">OnTrac</p>
          <p className="text-xs text-gray-500 truncate">Driver Check-In</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-100 group ${
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-surface-muted hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} strokeWidth={2} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Footer */}
      <div className="px-3 py-4 border-t border-surface-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-2">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <span className={`${roleBadge[user?.role] || 'badge-clerk'} mt-0.5`}>
              {user?.role}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-brand-700 hover:bg-brand-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-surface-soft">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-surface-border flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-64 bg-white border-r border-surface-border transform transition-transform duration-200 md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface-muted text-gray-500"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3.5 bg-white border-b border-surface-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-surface-muted text-gray-600"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">Driver Check-In</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <footer className="border-t border-surface-border bg-white px-4 py-2 text-center">
          <a
            href="https://aceddivision.com/devops"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-brand-600"
          >
            Developed by ACED DevOps
          </a>
        </footer>
      </div>
    </div>
  );
}
