import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, UserCheck, ClipboardList,
  Activity, Settings, LogOut, TrendingDown, TrendingUp, User, X,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useBrandingStore } from '@/store/brandingStore';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { currentUser, logout } = useAuthStore();
  const { addLog } = useLogStore();
  const { branding } = useBrandingStore();

  const navItems: NavItem[] = [
    { to: '/dashboard', icon: <LayoutDashboard className="h-5 w-5 shrink-0" />, label: t('nav.dashboard') },
    { to: '/teachers', icon: <Users className="h-5 w-5 shrink-0" />, label: t('nav.teachers') },
    { to: '/supervisors', icon: <UserCheck className="h-5 w-5 shrink-0" />, label: t('nav.supervisors') },
    { to: '/action-center', icon: <ClipboardList className="h-5 w-5 shrink-0" />, label: t('nav.actionCenter') },
    { to: '/bonuses', icon: <TrendingUp className="h-5 w-5 shrink-0" />, label: t('nav.bonuses') },
    { to: '/deductions', icon: <TrendingDown className="h-5 w-5 shrink-0" />, label: t('nav.deductions') },
    { to: '/activity-log', icon: <Activity className="h-5 w-5 shrink-0" />, label: t('nav.activityLog') },
    { to: '/settings', icon: <Settings className="h-5 w-5 shrink-0" />, label: t('nav.settings') },
  ];

  const handleLogout = () => {
    if (currentUser) {
      addLog({
        userId: currentUser.id, userName: currentUser.name, userRole: currentUser.role,
        action: 'logout', target: 'النظام', details: 'تسجيل خروج',
        tableName: 'auth',
      });
    }
    logout();
  };

  const displayName = isAr ? branding.nameAr : branding.nameEn;

  return (
    <aside className="flex flex-col h-full bg-primary text-white w-64 min-w-[256px] max-w-[256px]">
      {/* Brand header */}
      <div className="flex flex-col items-center py-5 px-4 border-b border-white/20 relative">
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 end-3 md:hidden p-1.5 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        )}
        <AcademyLogo size={52} ring className="mb-2 shadow-lg" />
        <h1 className="text-sm font-bold text-center leading-tight px-2">{displayName}</h1>
        <p className="text-[11px] text-white/70 text-center mt-0.5 line-clamp-2 px-2">{branding.tagline}</p>
      </div>

      {/* User info */}
      {currentUser && (
        <NavLink
          to="/profile"
          onClick={onClose}
          className="px-4 py-3 border-b border-white/20 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{currentUser.name}</p>
              <p className="text-xs text-white/70 truncate">{t(`roles.${currentUser.role}`)}</p>
            </div>
          </div>
        </NavLink>
      )}

      {/* Nav links */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-white/20 shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>{t('nav.logout')}</span>
        </button>
      </div>
    </aside>
  );
}

