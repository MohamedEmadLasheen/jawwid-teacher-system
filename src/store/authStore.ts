import { create } from 'zustand';
import type { User, UserRole, Permission } from '../lib/types';
import { ROLE_PERMISSIONS } from '../lib/permissions';
import {
  getSession,
  getProfileById,
  signIn,
  signOut,
  signUpSuperAdmin,
  createUser,
  updateProfile,
  updateLastLogin,
  changeOwnPassword,
  disableUser,
  deleteUserAccount,
  fetchAllUsers,
} from '../services/auth.service';

interface AuthState {
  currentUser: User | null;
  users: User[];
  isAuthenticated: boolean;
  needsSetup: boolean;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  createSuperAdmin: (name: string, email: string, password: string) => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'createdAt'>, password: string) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  disableUser: (id: string) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  changePassword: (userId: string, newPassword: string) => Promise<void>;
  updatePermissions: (userId: string, permissions: Permission[]) => Promise<void>;
  toggleLockedPermission: (userId: string, permission: Permission) => void;
  setLockedPermissions: (userId: string, locked: Permission[]) => Promise<void>;
  setError: (msg: string | null) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  users: [],
  isAuthenticated: false,
  needsSetup: false,
  loading: true,
  error: null,

  setError: (msg) => set({ error: msg }),

  initialize: async () => {
    try {
      const session = await getSession();

      if (session?.user) {
        const profile = await getProfileById(session.user.id);
        if (profile && profile.isActive) {
          set({ currentUser: profile, isAuthenticated: true });
        } else {
          await signOut();
        }
      }

      set({ loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchUsers: async () => {
    try {
      const users = await fetchAllUsers();
      set({ users });
    } catch {
      // Non-critical — silently ignore
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const { user } = await signIn(email, password);
      const profile = await getProfileById(user.id);

      if (!profile || !profile.isActive) {
        await signOut();
        return false;
      }

      await updateLastLogin(user.id);
      set({ currentUser: profile, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: async () => {
    try {
      await signOut();
    } finally {
      set({ currentUser: null, isAuthenticated: false, users: [] });
    }
  },

  createSuperAdmin: async (name, email, password) => {
    await signUpSuperAdmin(name, email, password);
    set({ needsSetup: false });
    await get().login(email, password);
  },

  addUser: async (userData, password) => {
    const newUser = await createUser(
      userData.name,
      userData.email,
      password,
      userData.role,
      userData.permissions,
      userData
    );
    set((state) => ({ users: [...state.users, newUser] }));
  },

  updateUser: async (id, updates) => {
    await updateProfile(id, updates);
    set((state) => ({
      users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
      currentUser:
        state.currentUser?.id === id
          ? { ...state.currentUser, ...updates }
          : state.currentUser,
    }));
  },

  disableUser: async (id) => {
    await disableUser(id);
    set((state) => ({
      users: state.users.map((u) => (u.id === id ? { ...u, isActive: false } : u)),
    }));
  },

  removeUser: async (id) => {
    await deleteUserAccount(id);
    set((state) => ({ users: state.users.filter((u) => u.id !== id) }));
  },

  changePassword: async (userId, newPassword) => {
    const { currentUser } = get();
    if (currentUser?.id === userId) {
      await changeOwnPassword(newPassword);
      set((state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, lastPasswordChange: new Date().toISOString() }
          : null,
      }));
    }
    // Changing another user's password requires a server-side function.
    // Current implementation only supports the logged-in user's own password.
  },

  updatePermissions: async (userId, permissions) => {
    await updateProfile(userId, { permissions });
    set((state) => ({
      users: state.users.map((u) => (u.id === userId ? { ...u, permissions } : u)),
    }));
  },

  toggleLockedPermission: (userId, permission) => {
    const { users, currentUser } = get();
    const target = users.find((u) => u.id === userId) ?? (currentUser?.id === userId ? currentUser : undefined);
    if (!target) return;
    const locked = target.lockedPermissions ?? [];
    const newLocked = locked.includes(permission)
      ? locked.filter((p) => p !== permission)
      : [...locked, permission];
    get().setLockedPermissions(userId, newLocked);
  },

  setLockedPermissions: async (userId, locked) => {
    await updateProfile(userId, { lockedPermissions: locked });
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, lockedPermissions: locked } : u
      ),
    }));
  },
}));

export { ROLE_PERMISSIONS };
