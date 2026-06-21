-- ============================================================
-- Jawwid Payroll — Initial Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- IMPORTANT: Before running, go to:
--   Authentication → Settings → Email Auth
--   and DISABLE "Confirm email" so admin-created users
--   can log in immediately without email verification.
-- ============================================================

-- Profiles table (extends auth.users with app-specific metadata)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  position TEXT,
  department TEXT,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('super_admin', 'admin', 'operation_admin', 'quality_admin')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  locked_permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  last_password_change TIMESTAMPTZ,
  avatar_initials TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  nationality TEXT DEFAULT '',
  joining_date DATE,
  monthly_salary NUMERIC NOT NULL DEFAULT 0,
  salary_currency TEXT NOT NULL DEFAULT 'EGP' CHECK (salary_currency IN ('EGP', 'USD')),
  salary_type TEXT NOT NULL DEFAULT 'fixed' CHECK (salary_type IN ('fixed', 'hourly', 'hybrid')),
  teaching_market TEXT NOT NULL DEFAULT 'arab' CHECK (teaching_market IN ('arab', 'non_arab', 'both')),
  specializations TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  level TEXT NOT NULL DEFAULT 'silver' CHECK (level IN ('silver', 'gold', 'platinum')),
  notes TEXT DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session evaluations
CREATE TABLE IF NOT EXISTS session_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  evaluator_name TEXT NOT NULL DEFAULT '',
  session_date DATE NOT NULL,
  tajweed_accuracy TEXT NOT NULL DEFAULT 'good',
  pronunciation TEXT NOT NULL DEFAULT 'good',
  correction_quality TEXT NOT NULL DEFAULT 'good',
  listening_skills TEXT NOT NULL DEFAULT 'good',
  punctuality TEXT NOT NULL DEFAULT 'good',
  time_management TEXT NOT NULL DEFAULT 'good',
  student_engagement TEXT NOT NULL DEFAULT 'good',
  class_flow TEXT NOT NULL DEFAULT 'good',
  professionalism TEXT NOT NULL DEFAULT 'good',
  clarity TEXT NOT NULL DEFAULT 'good',
  encouragement TEXT NOT NULL DEFAULT 'good',
  parent_communication TEXT NOT NULL DEFAULT 'good',
  lesson_preparation TEXT NOT NULL DEFAULT 'good',
  explanation_quality TEXT NOT NULL DEFAULT 'good',
  error_correction TEXT NOT NULL DEFAULT 'good',
  follow_up TEXT NOT NULL DEFAULT 'good',
  behavioral_observation TEXT NOT NULL DEFAULT 'good',
  quick_notes TEXT[] NOT NULL DEFAULT '{}',
  custom_note TEXT DEFAULT '',
  overall_score NUMERIC NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'good',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Complaints
CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  reported_by TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_supervisor TEXT,
  resolution_notes TEXT,
  resolution_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Complaint action history (each status transition logged here)
CREATE TABLE IF NOT EXISTS complaint_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  by_user TEXT NOT NULL DEFAULT '',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Improvement plans
CREATE TABLE IF NOT EXISTS improvement_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  action_steps TEXT NOT NULL DEFAULT '',
  target_date DATE,
  follow_up_date DATE,
  follow_up_percentage NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deductions
CREATE TABLE IF NOT EXISTS deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('absence', 'late_attendance', 'policy_violation', 'complaint_penalty', 'admin_violation')),
  currency TEXT NOT NULL DEFAULT 'EGP' CHECK (currency IN ('EGP', 'USD')),
  amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  supervisor_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bonuses
CREATE TABLE IF NOT EXISTS bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('outstanding_evaluation', 'attendance_excellence', 'student_retention', 'admin_excellence', 'special_achievement')),
  currency TEXT NOT NULL DEFAULT 'EGP' CHECK (currency IN ('EGP', 'USD')),
  amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  supervisor_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin recommendations
CREATE TABLE IF NOT EXISTS admin_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL
    CHECK (category IN ('promotion', 'warning', 'training', 'reward', 'performance_followup')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin notes (permanent, no deletion)
CREATE TABLE IF NOT EXISTS admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supervisors
CREATE TABLE IF NOT EXISTS supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  department TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity / audit log
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  before_value TEXT,
  after_value TEXT,
  table_name TEXT,
  record_id TEXT,
  ip TEXT DEFAULT '—',
  browser TEXT DEFAULT 'Unknown',
  device TEXT DEFAULT 'Desktop',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Branding settings (enforced single row via CHECK id = 1)
CREATE TABLE IF NOT EXISTS branding_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  logo_data_url TEXT DEFAULT '',
  name_ar TEXT NOT NULL DEFAULT 'أكاديمية جوِّد',
  name_en TEXT NOT NULL DEFAULT 'Jawwid Academy',
  tagline TEXT NOT NULL DEFAULT 'منصة إدارة المعلمين والإشراف والجودة',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  website TEXT DEFAULT '',
  address TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Salary records
CREATE TABLE IF NOT EXISTS salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  bonus NUMERIC NOT NULL DEFAULT 0,
  deduction NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  net NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single branding row
INSERT INTO branding_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Row Level Security
-- All tables require an authenticated Supabase session.
-- App-level permission system handles finer-grained authorization.
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;

-- Authenticated-only access policies
CREATE POLICY "auth_all" ON profiles        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON teachers        FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON session_evaluations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON complaints      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON complaint_actions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON improvement_plans FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON deductions      FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON bonuses         FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON admin_recommendations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON admin_notes     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON supervisors     FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON activity_logs   FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON branding_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all" ON salary_records  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_improvement_plans_updated_at
  BEFORE UPDATE ON improvement_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_admin_recommendations_updated_at
  BEFORE UPDATE ON admin_recommendations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_supervisors_updated_at
  BEFORE UPDATE ON supervisors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_branding_updated_at
  BEFORE UPDATE ON branding_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
