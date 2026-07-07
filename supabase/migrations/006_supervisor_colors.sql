-- ============================================================
-- Migration 006: Supervisor colors + real Operations Supervisors
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- The real scheduling spreadsheet color-codes each student by
-- their Operations Supervisor (confirmed with the user — colors
-- are not lesson status). The existing `supervisors` table
-- (migration 001, already live: Fatma/Quality, Hadeer/Operations)
-- is reused rather than creating a new entity:
--   * adds a UI-only color_hex column
--   * seeds the 4 real Operations Supervisors found in the sheet
--
-- The color is purely a display attribute for the schedule grid —
-- never business logic. Existing Fatma/Hadeer rows are untouched.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS, seed guarded by
-- WHERE NOT EXISTS on name).
-- ============================================================

ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS color_hex TEXT;

INSERT INTO supervisors (name, department, status, color_hex)
SELECT v.name, 'تشغيل', 'active', v.color_hex
FROM (VALUES
  ('Dina', '#E06666'),
  ('Zainab', '#F9CB9C'),
  ('Rehab', '#C9DAF8'),
  ('Basant', '#93C47D')
) AS v(name, color_hex)
WHERE NOT EXISTS (
  SELECT 1 FROM supervisors WHERE supervisors.name = v.name
);
