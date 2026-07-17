import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n/index';

import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TeachersPage } from '@/features/teachers/TeachersPage';
import { TeacherProfilePage } from '@/features/teachers/TeacherProfilePage';
import { SupervisorsPage } from '@/features/supervisors/SupervisorsPage';
import { ActionCenterPage } from '@/features/action-center/ActionCenterPage';
import { DeductionsPage } from '@/features/deductions/DeductionsPage';
import { BonusesPage } from '@/features/bonuses/BonusesPage';
import { ActivityLogPage } from '@/features/activity-log/ActivityLogPage';
import { StudentsPage } from '@/features/scheduling/StudentsPage';
import { ParentsPage } from '@/features/scheduling/ParentsPage';
import { CoursesPage } from '@/features/scheduling/CoursesPage';
import { ShiftTemplatesPage } from '@/features/scheduling/ShiftTemplatesPage';
import { LessonsPage } from '@/features/scheduling/LessonsPage';
import { MasterSchedulePage } from '@/features/scheduling/MasterSchedulePage';
import { TeacherWeeklySchedulePage } from '@/features/scheduling/TeacherWeeklySchedulePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { useAuthStore } from '@/store/authStore';
import { useBrandingStore } from '@/store/brandingStore';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { AcademyLogo } from '@/components/ui/AcademyLogo';
import { userCan, ROUTE_PERMISSIONS } from '@/lib/access';
import type { Permission } from '@/lib/types';

function DirectionSetter() {
  const { i18n } = useTranslation();
  const { branding } = useBrandingStore();
  useEffect(() => {
    const lang = i18n.language || 'ar';
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    const name = lang === 'ar' ? branding.nameAr : branding.nameEn;
    document.title = `${name} — ${branding.tagline}`;
  }, [i18n.language, branding]);
  return null;
}

function RootRedirect() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

// Per-route permission guard. Redirects to /dashboard if the current
// user lacks the permission for this route.
function Guard({ anyOf, children }: { anyOf?: Permission[] | null; children: React.ReactNode }) {
  const { currentUser } = useAuthStore();
  if (!userCan(currentUser, anyOf)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Global data loader — runs once after auth is confirmed
function DataLoader() {
  const { isAuthenticated, fetchUsers } = useAuthStore();
  const { fetchAll } = useTeacherStore();
  const { fetchSupervisors } = useSupervisorStore();
  const { fetchBranding } = useBrandingStore();

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchBranding();
    fetchAll();
    fetchSupervisors();
    fetchUsers();
  }, [isAuthenticated, fetchAll, fetchSupervisors, fetchBranding, fetchUsers]);

  return null;
}

// Full-screen spinner shown during the initial Supabase session check
function AppLoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary/80 flex flex-col items-center justify-center gap-4">
      <AcademyLogo size={72} ring className="animate-pulse" />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { initialize, loading } = useAuthStore();

  // Run once on mount — resolves session & checks needsSetup
  useEffect(() => {
    initialize();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <AppLoadingScreen />;

  return (
    <BrowserRouter>
      <DirectionSetter />
      <DataLoader />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="schedule" element={<Guard anyOf={ROUTE_PERMISSIONS['/schedule']}><MasterSchedulePage /></Guard>} />
          <Route path="schedule/teacher" element={<Guard anyOf={ROUTE_PERMISSIONS['/schedule/teacher']}><TeacherWeeklySchedulePage /></Guard>} />
          <Route path="teachers" element={<Guard anyOf={ROUTE_PERMISSIONS['/teachers']}><TeachersPage /></Guard>} />
          <Route path="teachers/:id" element={<Guard anyOf={ROUTE_PERMISSIONS['/teachers']}><TeacherProfilePage /></Guard>} />
          <Route path="supervisors" element={<Guard anyOf={ROUTE_PERMISSIONS['/supervisors']}><SupervisorsPage /></Guard>} />
          <Route path="action-center" element={<Guard anyOf={ROUTE_PERMISSIONS['/action-center']}><ActionCenterPage /></Guard>} />
          <Route path="deductions" element={<Guard anyOf={ROUTE_PERMISSIONS['/deductions']}><DeductionsPage /></Guard>} />
          <Route path="bonuses" element={<Guard anyOf={ROUTE_PERMISSIONS['/bonuses']}><BonusesPage /></Guard>} />
          <Route path="students" element={<Guard anyOf={ROUTE_PERMISSIONS['/students']}><StudentsPage /></Guard>} />
          <Route path="parents" element={<Guard anyOf={ROUTE_PERMISSIONS['/parents']}><ParentsPage /></Guard>} />
          <Route path="courses" element={<Guard anyOf={ROUTE_PERMISSIONS['/courses']}><CoursesPage /></Guard>} />
          <Route path="shift-templates" element={<Guard anyOf={ROUTE_PERMISSIONS['/shift-templates']}><ShiftTemplatesPage /></Guard>} />
          <Route path="lessons" element={<Guard anyOf={ROUTE_PERMISSIONS['/lessons']}><LessonsPage /></Guard>} />
          <Route path="activity-log" element={<Guard anyOf={ROUTE_PERMISSIONS['/activity-log']}><ActivityLogPage /></Guard>} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
