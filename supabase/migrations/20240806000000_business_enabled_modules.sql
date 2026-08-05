/*
  # Owner-selectable booking modules per business

  Booking modules (Rooms, Reservations, Orders, Appointments, …) were derived
  purely from a business's category, with no owner control. This adds an
  optional selection so an owner can turn specific modules on/off for their
  business.

  - `enabled_modules text[]` — the module keys (from categoryFeatures.ts) the
    owner has switched on.
  - NULL  = not configured → show ALL of the category's modules (legacy default,
            so every existing business is unaffected).
  - '{}'  = explicitly none → the profile shows no booking module.
  - '{rooms,orders}' = show only those.
*/

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS enabled_modules text[];
