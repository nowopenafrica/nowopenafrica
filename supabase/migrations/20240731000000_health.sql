-- Health operating system — doctor/consultation attributes on business_services.
-- A hospital/clinic lists each doctor or consultation as a business_services
-- row; service_category doubles as the department, and this flag marks whether
-- a video consultation (telemedicine) is offered. duration_min / image_url /
-- service_category already exist from earlier migrations.

ALTER TABLE public.business_services
  ADD COLUMN IF NOT EXISTS is_telemedicine boolean NOT NULL DEFAULT false;
