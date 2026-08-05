-- Add an optional phone number to enquiries so business owners can call/WhatsApp back.
ALTER TABLE business_enquiries ADD COLUMN IF NOT EXISTS phone text;
