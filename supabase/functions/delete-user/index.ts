// Supabase Edge Function: delete-user
//
// Permanently deletes an auth user (and, via the profiles FK
// ON DELETE CASCADE, their profile). Only an active super_admin may call it.
//
// Deploy:
//   supabase functions deploy delete-user
// (or paste this in Dashboard → Edge Functions → New function)
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the Supabase runtime — no secrets to set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Identify the caller from their JWT.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid session' }, 401);

    // Service-role client — bypasses RLS, can use the admin API.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only an active super_admin may delete users.
    const { data: caller } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();
    if (!caller || caller.role !== 'super_admin' || !caller.is_active) {
      return json({ error: 'Forbidden: super admin only' }, 403);
    }

    const { userId } = await req.json().catch(() => ({}));
    if (!userId) return json({ error: 'userId is required' }, 400);
    if (userId === user.id) return json({ error: 'You cannot delete your own account' }, 400);

    // Deleting the auth user cascades to profiles (FK ON DELETE CASCADE).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) return json({ error: delErr.message }, 400);

    return json({ success: true }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
