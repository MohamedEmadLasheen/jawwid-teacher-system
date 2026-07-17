-- ============================================================
-- Migration 020: Lesson Session Reports (Operations Module — Phase 1)
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Milestone 1 of the approved Operations Module Implementation
-- Roadmap. This is the per-occurrence, per-student session report
-- that replaces the spreadsheets' day-cell color + comment: one row
-- per student, per specific calendar occurrence of a lesson slot —
-- keyed off lesson_participants (not lessons), so a group lesson
-- gets one independent report per student. This closes the gap the
-- original scheduling schema explicitly deferred (migration 008's
-- own comment: "one student in a group being individually absent
-- that day... is explicitly out of scope here and deferred to the
-- future Attendance module, not modeled now").
--
-- Purely additive — does not alter lessons, lesson_participants,
-- lesson_exceptions, or any existing scheduling RPC in any way.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, DROP POLICY/TRIGGER
-- IF EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS lesson_session_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT (not CASCADE): a session report is a historical fact and
  -- must survive even if a student is later removed from the lesson's
  -- roster — removing the participant should be blocked, not silently
  -- destroy their attendance history. Same protective intent as
  -- lessons.teacher_id's own ON DELETE RESTRICT.
  lesson_participant_id UUID NOT NULL REFERENCES lesson_participants(id) ON DELETE RESTRICT,
  occurrence_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('delivered', 'absent_student', 'excused_family', 'excused_teacher')),
  is_makeup_session BOOLEAN NOT NULL DEFAULT false,
  -- Set only when a substitute (not the lesson's own teacher_id) delivered
  -- this specific occurrence — same substitute-vs-primary distinction
  -- already used elsewhere in the scheduling engine.
  delivered_by_teacher_id UUID REFERENCES teachers(id),
  performance_level TEXT CHECK (performance_level IN ('excellent', 'very_good', 'good', 'acceptable')),
  session_number_in_package INT CHECK (session_number_in_package > 0),
  content_covered TEXT NOT NULL DEFAULT '',
  homework TEXT NOT NULL DEFAULT '',
  next_session_plan TEXT NOT NULL DEFAULT '',
  reason_note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One report per student per specific occurrence. A student with two
  -- different lessons the same day is unaffected — each has its own
  -- lesson_participant_id, so each gets its own row.
  UNIQUE (lesson_participant_id, occurrence_date),
  -- Data validation rules from the approved Architecture doc, enforced
  -- at the database level rather than trusted to the UI alone.
  CHECK (status = 'delivered' OR reason_note <> ''),
  CHECK (performance_level IS NULL OR status = 'delivered')
);

CREATE INDEX IF NOT EXISTS idx_lesson_session_reports_lesson_participant_id ON lesson_session_reports (lesson_participant_id);
CREATE INDEX IF NOT EXISTS idx_lesson_session_reports_occurrence_date ON lesson_session_reports (occurrence_date);
CREATE INDEX IF NOT EXISTS idx_lesson_session_reports_delivered_by ON lesson_session_reports (delivered_by_teacher_id);

DROP TRIGGER IF EXISTS trg_lesson_session_reports_updated_at ON lesson_session_reports;
CREATE TRIGGER trg_lesson_session_reports_updated_at
  BEFORE UPDATE ON lesson_session_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS — the same two-tier pattern used for every other operational
-- table in this schema (lessons, lesson_participants, lesson_exceptions,
-- student_teacher_assignments): select/insert/update open to any
-- authenticated user, delete restricted to admin-level roles.
-- ------------------------------------------------------------
ALTER TABLE lesson_session_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_session_reports_select" ON lesson_session_reports;
DROP POLICY IF EXISTS "lesson_session_reports_insert" ON lesson_session_reports;
DROP POLICY IF EXISTS "lesson_session_reports_update" ON lesson_session_reports;
DROP POLICY IF EXISTS "lesson_session_reports_delete" ON lesson_session_reports;

CREATE POLICY "lesson_session_reports_select" ON lesson_session_reports
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "lesson_session_reports_insert" ON lesson_session_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "lesson_session_reports_update" ON lesson_session_reports
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "lesson_session_reports_delete" ON lesson_session_reports
  FOR DELETE USING (public.is_admin_level());
