import { createRoot } from 'react-dom/client';
import '@/index.css';
import i18n from '@/i18n';
import { SupervisorsPage } from '@/features/supervisors/SupervisorsPage';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import type { Permission } from '@/lib/types';

// Mounts the REAL
// SupervisorsPage and replaces only the store's updateSupervisorPermissions
// with a gate the test resolves/rejects by hand, so the in-flight window is
// deterministic and the failure path is real.
const params = new URLSearchParams(window.location.search);
i18n.changeLanguage(params.get('lang') ?? 'en');

type Gate = {
  calls: Array<{ id: string; perms: Permission[] }>;
  resolve?: () => void;
  reject?: (e: Error) => void;
};
const gate: Gate = { calls: [] };
(window as unknown as { __permSave: Gate }).__permSave = gate;

useLogStore.setState({ addLog: async () => {} });

useAuthStore.setState({
  currentUser: {
    id: 'sa-1', name: 'Super Admin', email: 'sa@example.test',
    role: 'super_admin', permissions: [], lockedPermissions: [],
    isActive: true, createdAt: new Date().toISOString(),
  },
  isAuthenticated: true, loading: false,
});

useSupervisorStore.setState({
  loading: false,
  error: null,
  supervisors: [{
    id: 'sup-1', name: 'Zainab', email: 'z@example.test', phone: '',
    department: 'تشغيل', status: 'active',
    permissions: ['manage_teachers', 'manage_students'] as Permission[],
    userId: 'auth-1', colorHex: '#C9DAF8',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }],
  updateSupervisorPermissions: (id: string, perms: Permission[]) =>
    new Promise<void>((res, rej) => {
      gate.calls.push({ id, perms });
      gate.resolve = res as () => void;
      gate.reject = rej;
    }),
});

createRoot(document.getElementById('root')!).render(<SupervisorsPage />);
