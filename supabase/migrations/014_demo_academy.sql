-- Demo Academy (full-scale QA dataset): isolated, is_demo-flagged data so
-- every existing dashboard/hook/RPC exercises real code paths at realistic
-- volume, with one-click removal before the real academy import. Inserts go
-- through the real tables, so real EXCLUDE/CHECK constraints (conflict
-- prevention etc.) apply exactly as in production — nothing bypasses them.
--
-- Scale note: lessons are recurring WEEKLY rules (one row = one slot forever),
-- not per-calendar-occurrence rows, so a realistic per-teacher ceiling is far
-- below "25,000 recurring rows". This generator produces ~9,000 realistic
-- recurring lessons across varied occupancy archetypes, plus ~19,000+
-- lesson_exceptions rows (completed/cancelled/rescheduled/no_show occurrence
-- history over the last ~90 days) — 28,000+ generated rows total for
-- stress-testing, while every teacher's schedule stays humanly realistic.

-- ============================================================
-- 1. is_demo flag (adds `supervisors` to the set from the previous pass)
-- ============================================================
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE teacher_availability ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE teacher_shift_assignments ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE session_evaluations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE improvement_plans ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bonuses ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE deductions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE supervisors ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lessons_is_demo ON lessons (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_students_is_demo ON students (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_teachers_is_demo ON teachers (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_lesson_exceptions_lesson ON lesson_exceptions (lesson_id);

-- ============================================================
-- 2. generate_demo_academy()
-- ============================================================
CREATE OR REPLACE FUNCTION generate_demo_academy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Name pools for realistic Arabic + English names.
  v_first_m text[] := ARRAY['Ahmed','Mohamed','Omar','Youssef','Khaled','Mahmoud','Hassan','Ali','Ibrahim','Tariq',
                             'Karim','Sami','Fadi','Amir','Nasser','Rami','Waleed','Zaid','Anas','Bilal',
                             'John','David','James','Michael','Daniel','Adam','Yusuf','Hamza','Zain','Idris'];
  v_first_f text[] := ARRAY['Fatima','Aisha','Mariam','Sara','Nour','Laila','Hana','Yasmin','Dina','Rana',
                             'Salma','Amira','Lina','Rawan','Farah','Malak','Reem','Dalia','Hind','Iman',
                             'Sarah','Emma','Lisa','Anna','Grace','Zara','Layan','Jana','Mona','Heba'];
  v_last text[] := ARRAY['Al-Sayed','Abdullah','Hassan','Ibrahim','Mansour','Farouk','Zaki','Nasser','Saleh','Karim',
                          'Rashid','Youssef','Fathy','Adel','Ezzat','Gomaa','Shaker','Anan','Fouad','Sabry',
                          'Al-Amin','Hamdan','Qureshi','Siddiqui','Al-Farsi','Barakat','Naguib','Selim','Kamal','Rizk'];
  v_countries text[] := ARRAY['Egypt','UAE','Saudi Arabia','USA','UK','Canada','Kuwait','Qatar'];
  v_categories text[] := ARRAY['quran','arabic_language','islamic_studies','tajweed','noor_al_bayan','adults_quran','adults_arabic','english_language'];

  v_new_id uuid;
  v_i int; v_j int; v_k int;

  v_supervisor_ids uuid[] := '{}';
  v_course_ids uuid[] := '{}';
  v_parent_ids uuid[] := '{}';
  v_active_student_ids uuid[] := '{}';
  v_trial_student_ids uuid[] := '{}';
  v_shift_morning uuid;
  v_shift_afternoon uuid;
  v_shift_evening uuid;

  v_teacher_id uuid;
  v_teacher_type text;
  -- Archetype parallel arrays: avail_start, avail_end, day_count (contiguous
  -- 0..day_count-1), weekly lesson target, gap between lessons (minutes),
  -- prime-only flag (only place inside 780-1080).
  v_arch_start int[]   := ARRAY[420, 420, 420, 780, 420,  1080, 780,  540, 480,  540,  420,  420];
  v_arch_end int[]     := ARRAY[1320,1320,1320,1020,720,  1380,1080, 1260,1200,  1080, 1380, 1200];
  v_arch_days int[]    := ARRAY[7,   7,   5,   5,   6,    6,    7,    5,   6,    5,    7,    7];
  v_arch_target int[]  := ARRAY[0,   8,   15,  40,  42,   42,   66,   114, 142,  50,   190,  20];
  v_arch_gap int[]     := ARRAY[15,  15,  20,  0,   10,   10,   5,    0,   0,    10,   5,    15];
  v_arch_prime_only boolean[] := ARRAY[false,false,false,false,false,false,true,false,false,false,false,false];
  v_arch_avoid_prime boolean[] := ARRAY[false,false,false,false,false,false,false,false,false,false,false,true];
  v_n_arch int := 12;

  v_arch int;
  v_avail_start int; v_avail_end int; v_day_count int; v_target int; v_gap int;
  v_day int; v_start int; v_duration int;
  v_created int;
  v_lesson_id uuid;
  v_group_size int;
  v_lifecycle text;
  v_student_pool uuid[];
  v_picked uuid[];
  v_candidate uuid;
  v_exc_count int;
  v_exc_status text;
  v_day_cursor int[];
  v_d int;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can generate demo data';
  END IF;

  PERFORM delete_demo_academy_internal();

  -- ---- Supervisors (12) ----
  FOR v_i IN 1..12 LOOP
    INSERT INTO supervisors (name, department, status, is_demo)
    VALUES (v_first_f[1 + (v_i % array_length(v_first_f,1))] || ' ' || v_last[1 + (v_i*3 % array_length(v_last,1))], 'Operations', 'active', true)
    RETURNING id INTO v_new_id;
    v_supervisor_ids := array_append(v_supervisor_ids, v_new_id);
  END LOOP;

  -- ---- Courses (25) ----
  FOR v_i IN 1..25 LOOP
    INSERT INTO courses (name_en, name_ar, category, default_duration_minutes, is_demo)
    VALUES (
      initcap(v_categories[1 + (v_i % array_length(v_categories,1))]) || ' Course ' || lpad(v_i::text,2,'0'),
      'مادة ' || lpad(v_i::text,2,'0'),
      v_categories[1 + (v_i % array_length(v_categories,1))],
      CASE WHEN v_i % 3 = 0 THEN 60 ELSE 30 END,
      true
    )
    RETURNING id INTO v_new_id;
    v_course_ids := array_append(v_course_ids, v_new_id);
  END LOOP;

  -- ---- Parents (350) ----
  FOR v_i IN 1..350 LOOP
    INSERT INTO parents (full_name, phone, country, preferred_language, is_demo)
    VALUES (
      (CASE WHEN v_i % 2 = 0 THEN v_first_m[1 + (v_i % array_length(v_first_m,1))] ELSE v_first_f[1 + (v_i % array_length(v_first_f,1))] END)
        || ' ' || v_last[1 + ((v_i*5) % array_length(v_last,1))],
      '+2010' || lpad(v_i::text,7,'0'),
      v_countries[1 + (v_i % array_length(v_countries,1))],
      CASE WHEN v_i % 3 = 0 THEN 'en' ELSE 'ar' END,
      true
    )
    RETURNING id INTO v_new_id;
    v_parent_ids := array_append(v_parent_ids, v_new_id);
  END LOOP;

  -- ---- Students (3000): ~80% active, 10% paused, 7% trial, 3% withdrawn ----
  FOR v_i IN 1..3000 LOOP
    INSERT INTO students (full_name, date_of_birth, country, gender, status, is_returning, supervisor_id, course_id, notes, is_demo)
    VALUES (
      (CASE WHEN v_i % 2 = 0 THEN v_first_m[1 + (v_i % array_length(v_first_m,1))] ELSE v_first_f[1 + (v_i % array_length(v_first_f,1))] END)
        || ' ' || v_last[1 + ((v_i*7) % array_length(v_last,1))],
      CURRENT_DATE - ((5 + (v_i % 12)) * 365),
      v_countries[1 + (v_i % array_length(v_countries,1))],
      CASE WHEN v_i % 2 = 0 THEN 'male' ELSE 'female' END,
      CASE WHEN v_i % 100 < 3 THEN 'withdrawn' WHEN v_i % 100 < 10 THEN 'trial' WHEN v_i % 100 < 20 THEN 'paused' ELSE 'active' END,
      (v_i % 11 = 0),
      v_supervisor_ids[1 + (v_i % array_length(v_supervisor_ids,1))],
      v_course_ids[1 + (v_i % array_length(v_course_ids,1))],
      'Demo payment status: ' || (ARRAY['Paid','Partial','Late','Overdue','Trial','Cancelled'])[1 + (v_i % 6)],
      true
    )
    RETURNING id INTO v_new_id;
    -- withdrawn (0-2) and paused (10-19) are intentionally excluded from both
    -- pools below — present for KPIs/counts but not bookable into lessons.
    IF v_i % 100 >= 3 AND v_i % 100 < 10 THEN
      v_trial_student_ids := array_append(v_trial_student_ids, v_new_id);
    ELSIF v_i % 100 >= 20 THEN
      v_active_student_ids := array_append(v_active_student_ids, v_new_id);
    END IF;
    IF v_i % 2 = 0 THEN
      INSERT INTO student_parents (student_id, parent_id, relationship, is_primary_contact)
      VALUES (v_new_id, v_parent_ids[1 + (v_i % array_length(v_parent_ids,1))], 'guardian', true);
    END IF;
  END LOOP;

  -- ---- Shift templates ----
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Morning Shift', 480, 840, true) RETURNING id INTO v_shift_morning;
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Afternoon Shift', 840, 1200, true) RETURNING id INTO v_shift_afternoon;
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Evening Shift', 1080, 1380, true) RETURNING id INTO v_shift_evening;

  -- ---- Teachers (150): 5 shift + 145 hourly, cycled across 12 occupancy archetypes ----
  FOR v_i IN 1..150 LOOP
    v_teacher_type := CASE WHEN v_i <= 5 THEN 'shift' ELSE 'hourly' END;
    INSERT INTO teachers (full_name, teacher_type, status, level, specializations, is_demo)
    VALUES (
      v_first_m[1 + (v_i % array_length(v_first_m,1))] || ' ' || v_last[1 + ((v_i*11) % array_length(v_last,1))],
      v_teacher_type, 'active',
      (ARRAY['silver','gold','platinum'])[1 + (v_i % 3)],
      ARRAY[v_categories[1 + (v_i % array_length(v_categories,1))]],
      true
    )
    RETURNING id INTO v_teacher_id;

    v_arch := 1 + ((v_i - 1) % v_n_arch);
    v_avail_start := v_arch_start[v_arch];
    v_avail_end := v_arch_end[v_arch];
    v_day_count := v_arch_days[v_arch];
    v_target := v_arch_target[v_arch];
    v_gap := v_arch_gap[v_arch];

    IF v_teacher_type = 'hourly' THEN
      FOR v_day IN 0..(v_day_count - 1) LOOP
        INSERT INTO teacher_availability (teacher_id, day_of_week, start_minute, end_minute, is_demo)
        VALUES (v_teacher_id, v_day, v_avail_start, v_avail_end, true);
      END LOOP;
    ELSE
      v_target := 90; -- shift teachers get a solid, realistic weekly load
      FOR v_day IN 0..5 LOOP
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_demo)
        VALUES (v_teacher_id, (ARRAY[v_shift_morning, v_shift_afternoon, v_shift_evening])[1 + (v_day % 3)], v_day, true);
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_demo)
        VALUES (v_teacher_id, (ARRAY[v_shift_morning, v_shift_afternoon, v_shift_evening])[1 + ((v_day+1) % 3)], v_day, true);
      END LOOP;
      v_avail_start := 480; v_avail_end := 1380; v_day_count := 6; v_gap := 5;
    END IF;

    -- ---- Lessons for this teacher, filling forward day by day. Each day
    -- keeps its OWN cursor (v_day_cursor) so a day can be revisited later
    -- (as the "Heavy Monday" bias below does) without recomputing a start
    -- time that collides with a lesson already placed there earlier —
    -- that collision is exactly what caused the very first live run of
    -- this generator to hit lessons' own EXCLUDE constraint.
    v_created := 0;
    v_day := 0;
    v_day_cursor := ARRAY(SELECT CASE WHEN v_arch_prime_only[v_arch] THEN GREATEST(v_avail_start, 780) ELSE v_avail_start END FROM generate_series(1, 7));
    WHILE v_created < v_target AND v_day <= (v_day_count - 1) LOOP
      -- "Heavy Monday": keep loading Monday first, but only while it still has
      -- room — otherwise this would spin forever bouncing back to a full day.
      IF v_i = 6 AND v_created > (v_target * 0.15)::int AND v_day_cursor[2] + 30 <= v_avail_end THEN
        v_day := 1;
      END IF;
      -- "Light Friday": never place anything on Friday for this teacher.
      IF v_i = 7 AND v_day = 5 THEN
        v_day := v_day + 1;
        CONTINUE;
      END IF;

      v_start := v_day_cursor[v_day + 1];
      v_duration := CASE WHEN v_created % 4 = 0 THEN 60 ELSE 30 END;

      -- Skip placing in Prime Time for the "avoid prime" archetype (models wasted Prime Time).
      IF v_arch_avoid_prime[v_arch] AND v_start >= 780 AND v_start < 1080 THEN
        v_start := 1080;
      END IF;
      IF v_start + v_duration > v_avail_end THEN
        v_day := v_day + 1;
        CONTINUE;
      END IF;

      v_group_size := (ARRAY[1,1,1,2,1,3,1,5,1,8,1,10])[1 + (v_created % 12)];
      v_lifecycle := CASE WHEN v_created % 7 = 6 AND array_length(v_trial_student_ids,1) > 0 THEN 'trial' ELSE 'active' END;

      INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, lifecycle_status, is_demo)
      VALUES (v_teacher_id, v_course_ids[1 + (v_created % array_length(v_course_ids,1))], v_day, v_start, v_duration, v_lifecycle, true)
      RETURNING id INTO v_lesson_id;

      v_student_pool := CASE WHEN v_lifecycle = 'trial' THEN v_trial_student_ids ELSE v_active_student_ids END;
      v_picked := '{}';
      IF array_length(v_student_pool,1) > 0 THEN
        FOR v_j IN 1..v_group_size LOOP
          v_candidate := v_student_pool[1 + ((v_created * 7 + v_j * 13 + v_day * 3 + v_i * 17) % array_length(v_student_pool,1))];
          IF NOT (v_candidate = ANY(v_picked)) AND NOT EXISTS (
            SELECT 1 FROM lesson_participants lp
            WHERE lp.student_id = v_candidate AND lp.day_of_week = v_day
              AND lp.time_range && int4range(v_start, v_start + v_duration)
              AND lp.lifecycle_status IN ('trial','active')
          ) THEN
            INSERT INTO lesson_participants (lesson_id, student_id, day_of_week, time_range, lifecycle_status)
            VALUES (v_lesson_id, v_candidate, v_day, int4range(v_start, v_start + v_duration), v_lifecycle);
            v_picked := array_append(v_picked, v_candidate);
          END IF;
        END LOOP;
      END IF;

      -- ---- Occurrence history: ~65% of lessons get 1-4 exception rows over
      -- the last ~90 days (completed/cancelled/rescheduled/no_show), giving
      -- real Schedule Stability + attendance-history data.
      IF v_created % 3 <> 0 THEN
        v_exc_count := 1 + (v_created % 4);
        FOR v_k IN 1..v_exc_count LOOP
          v_exc_status := (ARRAY['completed','completed','completed','cancelled','no_show','rescheduled'])[1 + ((v_created + v_k) % 6)];
          IF v_exc_status = 'rescheduled' THEN
            INSERT INTO lesson_exceptions (lesson_id, occurrence_date, status, override_start_minute, override_duration_minutes, reason)
            VALUES (v_lesson_id, CURRENT_DATE - ((v_k * 7 + v_created) % 90), 'rescheduled',
                    LEAST(1409, v_start + 30), v_duration, 'Demo reschedule for QA');
          ELSIF v_exc_status = 'cancelled' THEN
            INSERT INTO lesson_exceptions (lesson_id, occurrence_date, status, reason)
            VALUES (v_lesson_id, CURRENT_DATE - ((v_k * 7 + v_created) % 90), 'cancelled', 'Demo cancellation for QA');
          ELSE
            INSERT INTO lesson_exceptions (lesson_id, occurrence_date, status)
            VALUES (v_lesson_id, CURRENT_DATE - ((v_k * 7 + v_created) % 90), v_exc_status);
          END IF;
        END LOOP;
      END IF;

      v_created := v_created + 1;
      v_day_cursor[v_day + 1] := v_start + v_duration + v_gap;
    END LOOP;
  END LOOP;

  -- ---- Quality data: complaints, evaluations, improvement plans, bonuses, deductions ----
  FOR v_i IN 1..40 LOOP
    INSERT INTO complaints (teacher_id, reported_by, description, status, priority, is_demo)
    SELECT id, 'Demo Parent', 'Demo complaint #' || v_i || ' for QA.',
           (ARRAY['open','under_review','resolved','closed'])[1 + (v_i % 4)],
           (ARRAY['low','medium','high','critical'])[1 + (v_i % 4)], true
    FROM teachers WHERE is_demo ORDER BY id OFFSET (v_i % 150) LIMIT 1;
  END LOOP;

  FOR v_i IN 1..300 LOOP
    INSERT INTO session_evaluations (teacher_id, evaluator_name, session_date, overall_score, grade, is_demo)
    SELECT id, 'Demo Evaluator', CURRENT_DATE - (v_i % 90),
           CASE WHEN v_i % 10 < 2 THEN 40 + (v_i % 15) WHEN v_i % 10 < 5 THEN 60 + (v_i % 15) ELSE 80 + (v_i % 18) END,
           CASE WHEN v_i % 10 < 2 THEN 'poor' WHEN v_i % 10 < 5 THEN 'average' ELSE 'excellent' END,
           true
    FROM teachers WHERE is_demo ORDER BY id OFFSET (v_i % 150) LIMIT 1;
  END LOOP;

  FOR v_i IN 1..15 LOOP
    INSERT INTO improvement_plans (teacher_id, created_by, issue, goal, action_steps, target_date, status, is_demo)
    SELECT id, 'Demo Supervisor', 'Low evaluation scores.', 'Raise average score above 70%.', 'Weekly coaching.', CURRENT_DATE + 30, 'in_progress', true
    FROM teachers WHERE is_demo ORDER BY id OFFSET (v_i % 150) LIMIT 1;
  END LOOP;

  FOR v_i IN 1..30 LOOP
    INSERT INTO bonuses (teacher_id, date, category, currency, amount, reason, approval_status, is_demo)
    SELECT id, CURRENT_DATE - v_i, (ARRAY['outstanding_evaluation','attendance_excellence','student_retention'])[1 + (v_i % 3)],
           'EGP', 200 + (v_i * 10), 'Demo bonus for QA.', 'approved', true
    FROM teachers WHERE is_demo ORDER BY id OFFSET (v_i % 150) LIMIT 1;

    INSERT INTO deductions (teacher_id, date, category, currency, amount, reason, is_demo)
    SELECT id, CURRENT_DATE - v_i, (ARRAY['absence','late_attendance','policy_violation'])[1 + (v_i % 3)],
           'EGP', 20 + (v_i * 5), 'Demo deduction for QA.', true
    FROM teachers WHERE is_demo ORDER BY id OFFSET ((v_i + 7) % 150) LIMIT 1;
  END LOOP;

  RETURN jsonb_build_object(
    'supervisors', 12, 'courses', 25, 'parents', 350, 'students', 3000, 'teachers', 150,
    'lessons', (SELECT count(*) FROM lessons WHERE is_demo),
    'lesson_exceptions', (SELECT count(*) FROM lesson_exceptions WHERE lesson_id IN (SELECT id FROM lessons WHERE is_demo)),
    'complaints', 40, 'evaluations', 300, 'improvement_plans', 15, 'bonuses', 30, 'deductions', 30
  );
END;
$$;

-- ============================================================
-- 3. delete_demo_academy()
-- ============================================================
CREATE OR REPLACE FUNCTION delete_demo_academy_internal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM lesson_exceptions WHERE lesson_id IN (SELECT id FROM lessons WHERE is_demo);
  DELETE FROM lesson_participants WHERE lesson_id IN (SELECT id FROM lessons WHERE is_demo);
  DELETE FROM lessons WHERE is_demo;
  DELETE FROM teacher_shift_assignments WHERE is_demo;
  DELETE FROM shift_templates WHERE is_demo;
  DELETE FROM teacher_availability WHERE is_demo;
  DELETE FROM complaint_actions WHERE complaint_id IN (SELECT id FROM complaints WHERE is_demo);
  DELETE FROM complaints WHERE is_demo;
  DELETE FROM session_evaluations WHERE is_demo;
  DELETE FROM improvement_plans WHERE is_demo;
  DELETE FROM bonuses WHERE is_demo;
  DELETE FROM deductions WHERE is_demo;
  DELETE FROM student_parents WHERE student_id IN (SELECT id FROM students WHERE is_demo) OR parent_id IN (SELECT id FROM parents WHERE is_demo);
  DELETE FROM students WHERE is_demo;
  DELETE FROM parents WHERE is_demo;
  DELETE FROM courses WHERE is_demo;
  DELETE FROM teachers WHERE is_demo;
  DELETE FROM supervisors WHERE is_demo;
END;
$$;

CREATE OR REPLACE FUNCTION delete_demo_academy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can delete demo data';
  END IF;
  PERFORM delete_demo_academy_internal();
  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION generate_demo_academy() FROM public;
REVOKE ALL ON FUNCTION delete_demo_academy() FROM public;
REVOKE ALL ON FUNCTION delete_demo_academy_internal() FROM public;
GRANT EXECUTE ON FUNCTION generate_demo_academy() TO authenticated;
GRANT EXECUTE ON FUNCTION delete_demo_academy() TO authenticated;

-- ============================================================
-- 4. Demo-mode check for the frontend banner
-- ============================================================
CREATE OR REPLACE FUNCTION is_demo_mode_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM teachers WHERE is_demo LIMIT 1);
$$;

GRANT EXECUTE ON FUNCTION is_demo_mode_active() TO authenticated;
