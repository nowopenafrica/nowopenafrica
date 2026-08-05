-- Education operating system — course attributes on business_services.
-- A school/tutor lists each programme or course as a business_services row;
-- service_category doubles as the programme/level, instructor as the teacher,
-- class_schedule + duration_min as the timetable, and this flag marks online
-- learning. All those columns already exist (fitness/beauty/health migrations),
-- so only the online flag is new. Additive + nullable.

ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
