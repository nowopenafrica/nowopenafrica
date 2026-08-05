-- Fitness operating system — class/membership attributes on business_services.
-- A gym lists memberships and classes as business_services rows; these optional
-- columns turn a plain service into a membership plan or a scheduled class with
-- an instructor. All nullable + additive (image_url/capacity already exist from
-- the hotel migration).

ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS session_kind   text,     -- 'membership' | 'class'
  ADD COLUMN IF NOT EXISTS class_level    text,     -- 'Beginner' | 'Intermediate' | 'Advanced' | 'All levels'
  ADD COLUMN IF NOT EXISTS class_schedule text,     -- 'Mon, Wed, Fri · 6:00 PM'
  ADD COLUMN IF NOT EXISTS instructor     text,
  ADD COLUMN IF NOT EXISTS duration_min   integer;
