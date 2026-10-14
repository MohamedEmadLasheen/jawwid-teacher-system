-- =============================================================================
-- 026 — Hourly roster membership
-- =============================================================================
--
-- The Schedule's roster has two kinds of member:
--   * shift-based/part-time teachers — an active teacher_shift_assignments row
--     to an active shift_templates row (unchanged; the owner rule of
--     2026-10-13 fixes this set at the existing 14 teachers);
--   * hourly teachers — shown in the "Hourly" group.
--
-- Until now the Hourly group was derived only from booked lessons, so an
-- hourly teacher who is on the operations schedule but whose lessons are all
-- still pending (missing/ambiguous student records) did not appear at all.
-- This table records that a teacher belongs on the Schedule as an hourly
-- teacher, independent of whether a lesson is booked yet.
--
-- Deliberately NOT a shift template or an availability row: hourly teachers'
-- working hours are not recorded anywhere, and a template/availability row
-- would invent them. This table carries membership only — no time.
--
-- Additive and backward compatible: a new table, no change to any existing
-- table, row or behaviour. The frontend treats a missing table as empty, so
-- deploy order does not matter. Rollback: 026_rollback.sql.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_hourly_roster (
  teacher_id  uuid PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  -- Why the teacher is on the roster, e.g. 'operations workbook <sha12>,
  -- teacher_identity_map basis HISTORY_ESTABLISHED'. Free text for audit.
  source      text NOT NULL DEFAULT '',
  added_at    timestamptz NOT NULL DEFAULT now(),
  added_by    uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.schedule_hourly_roster IS
  'Hourly teachers who belong on the Schedule''s Hourly group. Membership only: no working hours are recorded or implied.';

ALTER TABLE public.schedule_hourly_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_hourly_roster_select" ON public.schedule_hourly_roster;
DROP POLICY IF EXISTS "schedule_hourly_roster_insert" ON public.schedule_hourly_roster;
DROP POLICY IF EXISTS "schedule_hourly_roster_delete" ON public.schedule_hourly_roster;

CREATE POLICY "schedule_hourly_roster_select" ON public.schedule_hourly_roster
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "schedule_hourly_roster_insert" ON public.schedule_hourly_roster
  FOR INSERT WITH CHECK (public.is_admin_level());
CREATE POLICY "schedule_hourly_roster_delete" ON public.schedule_hourly_roster
  FOR DELETE USING (public.is_admin_level());

-- Supabase's default privileges grant every privilege on a new public table
-- to anon and authenticated; narrow them to exactly what the policies allow.
REVOKE ALL ON public.schedule_hourly_roster FROM anon;
REVOKE ALL ON public.schedule_hourly_roster FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.schedule_hourly_roster TO authenticated;

COMMIT;
