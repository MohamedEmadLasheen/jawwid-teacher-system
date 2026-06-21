import { supabase, supabaseAdmin } from '@/lib/supabase';
import type { User, UserRole, Permission } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export function mapProfile(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    position: row.position ?? undefined,
    department: row.department ?? undefined,
    role: row.role as UserRole,
    permissions: row.permissions as Permission[],
    lockedPermissions: row.locked_permissions as Permission[],
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLogin: row.last_login ?? undefined,
    lastPasswordChange: row.last_password_change ?? undefined,
    avatarInitials: row.avatar_initials ?? undefined,
  };
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfileById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return mapProfile(data);
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Creates the initial super admin user.
 * Profile is created automatically by the on_auth_user_created trigger
 * (migration 002), so no explicit profiles.insert() is needed here —
 * that insert would fail with 401 when email confirmation is enabled.
 */
export async function signUpSuperAdmin(name: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role: 'super_admin',
        permissions: [],   // trigger will store these
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  // If email confirmation is disabled the session is set immediately.
  // If email confirmation is enabled the session is null — the trigger
  // still created the profile server-side, but the user must confirm
  // their email before they can log in.
  if (!data.session) {
    throw new Error(
      'Email confirmation is enabled in your Supabase project. ' +
      'Please go to Authentication → Settings → Email Auth and disable ' +
      '"Confirm email", then try again.'
    );
  }

  return data.user;
}

/**
 * Creates an admin/staff user from the super admin panel.
 * Uses a separate supabaseAdmin client (no session persistence) so it
 * never clobbers the currently logged-in user's session.
 * The profile row is created by the trigger; we then UPDATE it to add
 * optional fields (phone, position, department) using the admin's session.
 */
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  permissions: Permission[],
  extras?: Partial<User>
): Promise<User> {
  const { data, error } = await supabaseAdmin.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        role,
        permissions,                        // stored via trigger
        phone: extras?.phone ?? null,
        position: extras?.position ?? null,
        department: extras?.department ?? null,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error('User creation failed');

  // Small wait to allow the trigger to fire before we read the profile
  await new Promise((r) => setTimeout(r, 600));

  // Fetch the profile created by the trigger (using the admin's session)
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (fetchError || !profile) throw new Error('Profile was not created by trigger');
  return mapProfile(profile);
}

export async function updateProfile(userId: string, updates: Partial<User>) {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone ?? null;
  if (updates.position !== undefined) patch.position = updates.position ?? null;
  if (updates.department !== undefined) patch.department = updates.department ?? null;
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.permissions !== undefined) patch.permissions = updates.permissions as string[];
  if (updates.lockedPermissions !== undefined) patch.locked_permissions = updates.lockedPermissions as string[];
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (updates.avatarInitials !== undefined) patch.avatar_initials = updates.avatarInitials ?? null;

  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

export async function updateLastLogin(userId: string) {
  await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', userId);
}

export async function changeOwnPassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({ last_password_change: new Date().toISOString() }).eq('id', user.id);
  }
}

export async function checkNeedsSetup(): Promise<boolean> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin');
  if (error) return true;
  return (count ?? 0) === 0;
}

export async function fetchAllUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(mapProfile);
}

export async function disableUser(userId: string) {
  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
  if (error) throw error;
}
