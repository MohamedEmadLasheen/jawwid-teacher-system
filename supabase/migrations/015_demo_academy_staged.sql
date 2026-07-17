-- Staged Demo Academy generation: replaces the single ~28,000-row
-- generate_demo_academy() transaction (which hit the API role's
-- statement_timeout) with small, independently-callable batch functions.
-- Each call is its own transaction — if one fails it rolls back on its
-- own (already-committed earlier batches are untouched), so the client
-- can safely retry just the failed batch without creating duplicates.
-- Every row is still tagged is_demo = true; delete_demo_academy() (from
-- 014) is unchanged and still removes everything.

DROP FUNCTION IF EXISTS generate_demo_academy();

-- ============================================================
-- Small, one-shot stages
-- ============================================================
CREATE OR REPLACE FUNCTION demo_gen_supervisors()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_f text[] := ARRAY['Fatima','Aisha','Mariam','Sara','Nour','Laila','Hana','Yasmin','Dina','Rana','Salma','Amira'];
  v_last text[] := ARRAY['Al-Sayed','Abdullah','Hassan','Ibrahim','Mansour','Farouk','Zaki','Nasser','Saleh','Karim','Rashid','Youssef'];
  v_i int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  FOR v_i IN 1..12 LOOP
    INSERT INTO supervisors (name, department, status, is_demo)
    VALUES (v_first_f[v_i] || ' ' || v_last[v_i], 'Operations', 'active', true);
  END LOOP;
  RETURN jsonb_build_object('inserted', 12);
END;
$$;

CREATE OR REPLACE FUNCTION demo_gen_courses()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_categories text[] := ARRAY['quran','arabic_language','islamic_studies','tajweed','noor_al_bayan','adults_quran','adults_arabic','english_language'];
  v_i int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  FOR v_i IN 1..25 LOOP
    INSERT INTO courses (name_en, name_ar, category, default_duration_minutes, is_demo)
    VALUES (
      initcap(v_categories[1 + (v_i % array_length(v_categories,1))]) || ' Course ' || lpad(v_i::text,2,'0'),
      'مادة ' || lpad(v_i::text,2,'0'),
      v_categories[1 + (v_i % array_length(v_categories,1))],
      CASE WHEN v_i % 3 = 0 THEN 60 ELSE 30 END,
      true
    );
  END LOOP;
  RETURN jsonb_build_object('inserted', 25);
END;
$$;

CREATE OR REPLACE FUNCTION demo_gen_parents()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_m text[] := ARRAY['Ahmed','Mohamed','Omar','Youssef','Khaled','Mahmoud','Hassan','Ali','Ibrahim','Tariq','Karim','Sami','Fadi','Amir','Nasser'];
  v_first_f text[] := ARRAY['Fatima','Aisha','Mariam','Sara','Nour','Laila','Hana','Yasmin','Dina','Rana','Salma','Amira','Lina','Rawan','Farah'];
  v_last text[] := ARRAY['Al-Sayed','Abdullah','Hassan','Ibrahim','Mansour','Farouk','Zaki','Nasser','Saleh','Karim','Rashid','Youssef','Fathy','Adel','Ezzat'];
  v_i int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  FOR v_i IN 1..350 LOOP
    INSERT INTO parents (full_name, phone, country, preferred_language, is_demo)
    VALUES (
      (CASE WHEN v_i % 2 = 0 THEN v_first_m[1 + (v_i % array_length(v_first_m,1))] ELSE v_first_f[1 + (v_i % array_length(v_first_f,1))] END)
        || ' ' || v_last[1 + ((v_i*5) % array_length(v_last,1))],
      '+2010' || lpad(v_i::text,7,'0'),
      (ARRAY['Egypt','UAE','Saudi Arabia','USA','UK','Canada','Kuwait','Qatar'])[1 + (v_i % 8)],
      CASE WHEN v_i % 3 = 0 THEN 'en' ELSE 'ar' END,
      true
    );
  END LOOP;
  RETURN jsonb_build_object('inserted', 350);
END;
$$;

CREATE OR REPLACE FUNCTION demo_gen_shift_templates()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Morning Shift', 480, 840, true);
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Afternoon Shift', 840, 1200, true);
  INSERT INTO shift_templates (name, start_minute, end_minute, is_demo) VALUES ('Demo Evening Shift', 1080, 1380, true);
  RETURN jsonb_build_object('inserted', 3);
END;
$$;

-- ============================================================
-- Batched stages — take (p_batch, p_batch_size), each call handles one slice.
-- ============================================================

-- Students: batch 0..9, 300 per batch (3000 total).
CREATE OR REPLACE FUNCTION demo_gen_students(p_batch int, p_batch_size int DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
  v_supervisor_ids uuid[]; v_course_ids uuid[]; v_parent_ids uuid[];
  v_new_id uuid; v_i int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  SELECT array_agg(id) INTO v_supervisor_ids FROM supervisors WHERE is_demo;
  SELECT array_agg(id) INTO v_course_ids FROM courses WHERE is_demo;
  SELECT array_agg(id) INTO v_parent_ids FROM parents WHERE is_demo;

  FOR v_i IN (p_batch * p_batch_size + 1)..(p_batch * p_batch_size + p_batch_size) LOOP
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
    IF v_i % 2 = 0 THEN
      INSERT INTO student_parents (student_id, parent_id, relationship, is_primary_contact)
      VALUES (v_new_id, v_parent_ids[1 + (v_i % array_length(v_parent_ids,1))], 'guardian', true);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted', p_batch_size);
END;
$$;

-- Teachers: batch 0..5, 25 per batch (150 total). Batch 0 contains indices
-- 1-5, which are the shift-type teachers; the rest in every batch are hourly.
CREATE OR REPLACE FUNCTION demo_gen_teachers(p_batch int, p_batch_size int DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_m text[] := ARRAY['Ahmed','Mohamed','Omar','Youssef','Khaled','Mahmoud','Hassan','Ali','Ibrahim','Tariq',
                             'Karim','Sami','Fadi','Amir','Nasser','Rami','Waleed','Zaid','Anas','Bilal',
                             'John','David','James','Michael','Daniel','Adam','Yusuf','Hamza','Zain','Idris'];
  v_last text[] := ARRAY['Al-Sayed','Abdullah','Hassan','Ibrahim','Mansour','Farouk','Zaki','Nasser','Saleh','Karim',
                          'Rashid','Youssef','Fathy','Adel','Ezzat','Gomaa','Shaker','Anan','Fouad','Sabry',
                          'Al-Amin','Hamdan','Qureshi','Siddiqui','Al-Farsi','Barakat','Naguib','Selim','Kamal','Rizk'];
  v_categories text[] := ARRAY['quran','arabic_language','islamic_studies','tajweed','noor_al_bayan','adults_quran','adults_arabic','english_language'];
  v_arch_start int[] := ARRAY[420, 420, 420, 780, 420,  1080, 780,  540, 480,  540,  420,  420];
  v_arch_end int[]   := ARRAY[1320,1320,1320,1020,720,  1380,1080, 1260,1200,  1080, 1380, 1200];
  v_arch_days int[]  := ARRAY[7,   7,   5,   5,   6,    6,    7,    5,   6,    5,    7,    7];
  v_shift_ids uuid[];
  v_teacher_id uuid; v_teacher_type text; v_arch int;
  v_avail_start int; v_avail_end int; v_day_count int;
  v_i int; v_day int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  SELECT array_agg(id ORDER BY name) INTO v_shift_ids FROM shift_templates WHERE is_demo;

  FOR v_i IN (p_batch * p_batch_size + 1)..(p_batch * p_batch_size + p_batch_size) LOOP
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

    v_arch := 1 + ((v_i - 1) % 12);
    IF v_teacher_type = 'hourly' THEN
      v_avail_start := v_arch_start[v_arch]; v_avail_end := v_arch_end[v_arch]; v_day_count := v_arch_days[v_arch];
      FOR v_day IN 0..(v_day_count - 1) LOOP
        INSERT INTO teacher_availability (teacher_id, day_of_week, start_minute, end_minute, is_demo)
        VALUES (v_teacher_id, v_day, v_avail_start, v_avail_end, true);
      END LOOP;
    ELSE
      FOR v_day IN 0..5 LOOP
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_demo)
        VALUES (v_teacher_id, v_shift_ids[1 + (v_day % 3)], v_day, true);
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_demo)
        VALUES (v_teacher_id, v_shift_ids[1 + ((v_day+1) % 3)], v_day, true);
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('inserted', p_batch_size);
END;
$$;

-- Lessons: batch 0..14, 10 teachers per batch (150 teachers total), keyed by
-- each demo teacher's creation-order row number (stable across calls since
-- it's recomputed from created_at, not carried in memory). Each teacher's
-- archetype/target/day-cursor logic matches the corrected (non-colliding)
-- version from migration 014.
CREATE OR REPLACE FUNCTION demo_gen_lessons(p_batch int, p_batch_size int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_arch_start int[]   := ARRAY[420, 420, 420, 780, 420,  1080, 780,  540, 480,  540,  420,  420];
  v_arch_end int[]     := ARRAY[1320,1320,1320,1020,720,  1380,1080, 1260,1200,  1080, 1380, 1200];
  v_arch_days int[]    := ARRAY[7,   7,   5,   5,   6,    6,    7,    5,   6,    5,    7,    7];
  v_arch_target int[]  := ARRAY[0,   8,   15,  40,  42,   42,   66,   114, 142,  50,   190,  20];
  v_arch_gap int[]     := ARRAY[15,  15,  20,  0,   10,   10,   5,    0,   0,    10,   5,    15];
  v_arch_prime_only boolean[]  := ARRAY[false,false,false,false,false,false,true,false,false,false,false,false];
  v_arch_avoid_prime boolean[] := ARRAY[false,false,false,false,false,false,false,false,false,false,false,true];

  v_course_ids uuid[]; v_active_student_ids uuid[]; v_trial_student_ids uuid[];
  v_teacher record;
  v_arch int; v_avail_start int; v_avail_end int; v_day_count int; v_target int; v_gap int;
  v_day int; v_start int; v_duration int; v_created int;
  v_lesson_id uuid; v_group_size int; v_lifecycle text;
  v_student_pool uuid[]; v_picked uuid[]; v_candidate uuid;
  v_exc_count int; v_exc_status text;
  v_day_cursor int[];
  v_j int; v_k int; v_lessons_made int := 0; v_exceptions_made int := 0;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  SELECT array_agg(id) INTO v_course_ids FROM courses WHERE is_demo;
  SELECT array_agg(id) INTO v_active_student_ids FROM students WHERE is_demo AND status = 'active';
  SELECT array_agg(id) INTO v_trial_student_ids FROM students WHERE is_demo AND status = 'trial';

  -- Ordered by ctid (physical insertion order), not created_at: every teacher
  -- in one demo_gen_teachers() batch shares the same transaction timestamp,
  -- so created_at can't distinguish them and a created_at/id sort silently
  -- scrambles the archetype assignment below (confirmed live: teachers #5 and
  -- #10 by that ordering were both 'shift' type, not the intended first five).
  FOR v_teacher IN (
    SELECT id, teacher_type, rn FROM (
      SELECT id, teacher_type, row_number() OVER (ORDER BY ctid) AS rn
      FROM teachers WHERE is_demo
    ) t
    WHERE rn > p_batch * p_batch_size AND rn <= p_batch * p_batch_size + p_batch_size
    ORDER BY rn
  ) LOOP
    v_arch := 1 + ((v_teacher.rn - 1) % 12);
    IF v_teacher.teacher_type = 'hourly' THEN
      v_avail_start := v_arch_start[v_arch]; v_avail_end := v_arch_end[v_arch];
      v_day_count := v_arch_days[v_arch]; v_target := v_arch_target[v_arch]; v_gap := v_arch_gap[v_arch];
    ELSE
      v_avail_start := 480; v_avail_end := 1380; v_day_count := 6; v_target := 90; v_gap := 5;
    END IF;

    v_created := 0;
    v_day := 0;
    v_day_cursor := ARRAY(SELECT CASE WHEN v_teacher.teacher_type = 'hourly' AND v_arch_prime_only[v_arch] THEN GREATEST(v_avail_start, 780) ELSE v_avail_start END FROM generate_series(1, 7));
    WHILE v_created < v_target AND v_day <= (v_day_count - 1) LOOP
      -- (A "Heavy Monday" bias used to live here: force day:=1 while it still
      -- had >=30 min free. That fixed margin didn't account for the *next*
      -- lesson sometimes needing 60 min, so once day 1 had room for a 30 but
      -- not the 60 actually due, the guard forced day back to 1, the insert
      -- failed and advanced to day 2, and the guard immediately forced it
      -- back — an infinite loop, confirmed live via a hung/timed-out batch.
      -- Removed; the 12 archetypes already give real occupancy variety.)
      IF v_teacher.rn = 7 AND v_day = 5 THEN
        v_day := v_day + 1;
        CONTINUE;
      END IF;

      v_start := v_day_cursor[v_day + 1];
      v_duration := CASE WHEN v_created % 4 = 0 THEN 60 ELSE 30 END;

      IF v_teacher.teacher_type = 'hourly' AND v_arch_avoid_prime[v_arch] AND v_start >= 780 AND v_start < 1080 THEN
        v_start := 1080;
      END IF;
      IF v_start + v_duration > v_avail_end THEN
        v_day := v_day + 1;
        CONTINUE;
      END IF;

      v_group_size := (ARRAY[1,1,1,2,1,3,1,5,1,8,1,10])[1 + (v_created % 12)];
      v_lifecycle := CASE WHEN v_created % 7 = 6 AND array_length(v_trial_student_ids,1) > 0 THEN 'trial' ELSE 'active' END;

      INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, lifecycle_status, is_demo)
      VALUES (v_teacher.id, v_course_ids[1 + (v_created % array_length(v_course_ids,1))], v_day, v_start, v_duration, v_lifecycle, true)
      RETURNING id INTO v_lesson_id;
      v_lessons_made := v_lessons_made + 1;

      v_student_pool := CASE WHEN v_lifecycle = 'trial' THEN v_trial_student_ids ELSE v_active_student_ids END;
      v_picked := '{}';
      IF array_length(v_student_pool,1) > 0 THEN
        FOR v_j IN 1..v_group_size LOOP
          v_candidate := v_student_pool[1 + ((v_created * 7 + v_j * 13 + v_day * 3 + v_teacher.rn * 17) % array_length(v_student_pool,1))];
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
          v_exceptions_made := v_exceptions_made + 1;
        END LOOP;
      END IF;

      v_created := v_created + 1;
      v_day_cursor[v_day + 1] := v_start + v_duration + v_gap;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('lessons_inserted', v_lessons_made, 'exceptions_inserted', v_exceptions_made);
END;
$$;

-- Quality data: evaluations/complaints/improvement plans/bonuses/deductions.
-- Cheap enough (415 rows) for a single call.
CREATE OR REPLACE FUNCTION demo_gen_quality()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- No v_i variable here: each INSERT below uses `v_i` as the
  -- generate_series() column alias, and a same-named plpgsql variable
  -- makes every reference to it ambiguous (confirmed live).
  v_teacher_ids uuid[];
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'Only a super admin can generate demo data'; END IF;
  SELECT array_agg(id ORDER BY created_at) INTO v_teacher_ids FROM teachers WHERE is_demo;

  INSERT INTO complaints (teacher_id, reported_by, description, status, priority, is_demo)
  SELECT v_teacher_ids[1 + (v_i % array_length(v_teacher_ids,1))], 'Demo Parent', 'Demo complaint #' || v_i || ' for QA.',
         (ARRAY['open','under_review','resolved','closed'])[1 + (v_i % 4)],
         (ARRAY['low','medium','high','critical'])[1 + (v_i % 4)], true
  FROM generate_series(1, 40) v_i;

  INSERT INTO session_evaluations (teacher_id, evaluator_name, session_date, overall_score, grade, is_demo)
  SELECT v_teacher_ids[1 + (v_i % array_length(v_teacher_ids,1))], 'Demo Evaluator', CURRENT_DATE - (v_i % 90),
         CASE WHEN v_i % 10 < 2 THEN 40 + (v_i % 15) WHEN v_i % 10 < 5 THEN 60 + (v_i % 15) ELSE 80 + (v_i % 18) END,
         CASE WHEN v_i % 10 < 2 THEN 'poor' WHEN v_i % 10 < 5 THEN 'average' ELSE 'excellent' END,
         true
  FROM generate_series(1, 300) v_i;

  INSERT INTO improvement_plans (teacher_id, created_by, issue, goal, action_steps, target_date, status, is_demo)
  SELECT v_teacher_ids[1 + (v_i % array_length(v_teacher_ids,1))], 'Demo Supervisor', 'Low evaluation scores.', 'Raise average score above 70%.', 'Weekly coaching.', CURRENT_DATE + 30, 'in_progress', true
  FROM generate_series(1, 15) v_i;

  INSERT INTO bonuses (teacher_id, date, category, currency, amount, reason, approval_status, is_demo)
  SELECT v_teacher_ids[1 + (v_i % array_length(v_teacher_ids,1))], CURRENT_DATE - v_i, (ARRAY['outstanding_evaluation','attendance_excellence','student_retention'])[1 + (v_i % 3)],
         'EGP', 200 + (v_i * 10), 'Demo bonus for QA.', 'approved', true
  FROM generate_series(1, 30) v_i;

  INSERT INTO deductions (teacher_id, date, category, currency, amount, reason, is_demo)
  SELECT v_teacher_ids[1 + ((v_i + 7) % array_length(v_teacher_ids,1))], CURRENT_DATE - v_i, (ARRAY['absence','late_attendance','policy_violation'])[1 + (v_i % 3)],
         'EGP', 20 + (v_i * 5), 'Demo deduction for QA.', true
  FROM generate_series(1, 30) v_i;

  RETURN jsonb_build_object('complaints', 40, 'evaluations', 300, 'improvement_plans', 15, 'bonuses', 30, 'deductions', 30);
END;
$$;

REVOKE ALL ON FUNCTION demo_gen_supervisors() FROM public;
REVOKE ALL ON FUNCTION demo_gen_courses() FROM public;
REVOKE ALL ON FUNCTION demo_gen_parents() FROM public;
REVOKE ALL ON FUNCTION demo_gen_shift_templates() FROM public;
REVOKE ALL ON FUNCTION demo_gen_students(int, int) FROM public;
REVOKE ALL ON FUNCTION demo_gen_teachers(int, int) FROM public;
REVOKE ALL ON FUNCTION demo_gen_lessons(int, int) FROM public;
REVOKE ALL ON FUNCTION demo_gen_quality() FROM public;

GRANT EXECUTE ON FUNCTION demo_gen_supervisors() TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_courses() TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_parents() TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_shift_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_students(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_teachers(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_lessons(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION demo_gen_quality() TO authenticated;
