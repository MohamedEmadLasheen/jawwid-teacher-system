import { useTranslation } from 'react-i18next';
import { Menu, Bell, User, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useBrandingStore } from '@/store/brandingStore';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface HeaderProps {
  onMenuToggle?: () => void;
  title?: string;
}

export function Header({ onMenuToggle, title }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { currentUser, logout } = useAuthStore();
  const { notifications, markAsRead, markAllAsRead } = useNotificationStore();
  const { branding } = useBrandingStore();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const recentNotifs = notifications.slice(0, 6);

  const notifTypeColor: Record<string, string> = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
    info: 'bg-blue-500',
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-primary text-white px-3 sm:px-4 py-2 flex items-center justify-between shadow-md shrink-0 min-h-[52px]">
      {/* Left: hamburger + title */}
      <div className="flex items-center gap-2 min-w-0">
        {onMenuToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="md:hidden text-white hover:bg-white/20 shrink-0 h-9 w-9"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <AcademyLogo size={28} ring className="hidden md:block shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight truncate max-w-[140px] sm:max-w-xs">
              {title || (isAr ? branding.nameAr : branding.nameEn)}
            </h2>
          </div>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <LanguageSwitcher />

        {/* Notification Bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 relative h-9 w-9">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={isAr ? 'start' : 'end'}
            className="w-[min(320px,calc(100vw-16px))] max-h-[70vh] overflow-y-auto"
          >
            <DropdownMenuLabel className="flex items-center gap-2">
              <AcademyLogo size={18} />
              <span className="flex-1 text-sm">{t('notification.title')}</span>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-primary hover:underline">
                  {t('notification.markAllRead')}
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {recentNotifs.length === 0 ? (
              <div className="p-6 flex flex-col items-center gap-2 text-center">
                <AcademyLogo size={36} className="opacity-30" />
                <p className="text-sm text-muted-foreground">{t('notification.noNotifications')}</p>
              </div>
            ) : (
              recentNotifs.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  className={cn('flex items-start gap-2 p-3 cursor-pointer', !notif.isRead && 'bg-blue-50')}
                  onClick={() => {
                    markAsRead(notif.id);
                    if (notif.link) navigate(notif.link);
                  }}
                >
                  <span className={cn('mt-1 w-2 h-2 rounded-full shrink-0', notifTypeColor[notif.type])} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{isAr ? notif.titleAr : notif.titleEn}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{isAr ? notif.messageAr : notif.messageEn}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: isAr ? ar : undefined })}
                    </p>
                  </div>
                  {!notif.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User dropdown */}
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 hover:bg-white/10 rounded-lg px-1.5 py-1 transition-colors">
                <div className="w-7 h-7 bg-secondary rounded-full flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="hidden sm:block text-xs text-white/90 max-w-[80px] truncate">{currentUser.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isAr ? 'start' : 'end'} className="w-52">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b">
                <AcademyLogo size={32} ring />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{currentUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t(`roles.${currentUser.role}`)}</p>
                </div>
              </div>
              <DropdownMenuItem onClick={() => navigate('/profile')} className="mt-1">
                <User className="h-4 w-4 me-2" />
                {t('nav.profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4 me-2" />
                {t('nav.settings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                <LogOut className="h-4 w-4 me-2" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

