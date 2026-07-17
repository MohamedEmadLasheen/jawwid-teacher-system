import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Main client — persists auth session in localStorage
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Secondary client used ONLY for admin-initiated signUp (creating other users).
// No session persistence so it never clobbers the currently logged-in session.
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// PostgREST caps a single response at 1000 rows by default — a query with no .range()
// silently truncates past that instead of erroring, which only surfaces once a table
// (lessons, students, lesson_participants, lesson_exceptions...) actually grows past 1000
// rows. Any service function that fetches an entire table/filtered-set at once should use
// this instead of a bare .select() to stay correct as data scales.
const SUPABASE_MAX_ROWS = 1000;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + SUPABASE_MAX_ROWS - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SUPABASE_MAX_ROWS) break;
    from += SUPABASE_MAX_ROWS;
  }
  return rows;
}
