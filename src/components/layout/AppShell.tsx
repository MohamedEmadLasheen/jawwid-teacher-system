import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DemoModeBanner } from './DemoModeBanner';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { useBrandingStore } from '@/store/brandingStore';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'dashboard.title',
  '/teachers': 'teachers.title',
  '/supervisors': 'supervisors.title',
  '/action-center': 'actionCenter.title',
  '/deductions': 'deduction.title',
  '/bonuses': 'bonus.title',
  '/activity-log': 'activityLog.title',
  '/settings': 'settings.title',
};

function AppFooter() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { branding } = useBrandingStore();

  return (
    // The footer is the app's bottom edge, so it carries the home-indicator
    // inset — the white bar simply extends into it instead of leaving a strip.
    <footer className="border-t border-gray-200 bg-white px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center justify-between print:flex shrink-0">
      <div className="flex items-center gap-2">
        <AcademyLogo size={22} />
        <div>
          <p className="text-xs font-semibold text-primary">
            {isAr ? branding.nameAr : branding.nameEn}
          </p>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground text-end hidden sm:block">
        {branding.email && <p>{branding.email}</p>}
        {!branding.email && (
          <p>{isAr ? 'نظام إدارة المعلمين والجودة' : 'Teacher Management & Quality System'}</p>
        )}
      </div>
    </footer>
  );
}

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  const basePath = '/' + location.pathname.split('/')[1];
  const titleKey = PAGE_TITLES[basePath] || 'app.system';
  const title = t(titleKey);

  return (
    // bg-primary is only ever visible in the safe-area strips an installed iOS
    // app leaves around the content (0px everywhere else); teal there matches
    // the header and keeps the translucent status bar legible. The page
    // background moves onto the content column below.
    <div className="app-viewport flex overflow-hidden bg-primary">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, drawer on open */}
      <div
        className={cn(
          'fixed inset-y-0 start-0 z-30 md:relative md:flex md:flex-shrink-0 transition-transform duration-300',
          // The drawer is fixed, so it escapes the shell's safe-area padding
          // and has to keep clear of the status bar / home indicator itself.
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          // RTL: drawer slides from right
          'rtl:translate-x-full rtl:md:translate-x-0',
          sidebarOpen && 'rtl:translate-x-0'
        )}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-[#F8F8F8]">
        <DemoModeBanner />
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} title={title} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
