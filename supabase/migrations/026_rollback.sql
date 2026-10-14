-- Rollback for 026_schedule_hourly_roster.sql. Removes only the membership
-- table; no lesson, teacher or shift data is touched. Hourly teachers with
-- booked lessons stay visible (that membership is derived from lessons).
BEGIN;
DROP TABLE IF EXISTS public.schedule_hourly_roster;
COMMIT;
