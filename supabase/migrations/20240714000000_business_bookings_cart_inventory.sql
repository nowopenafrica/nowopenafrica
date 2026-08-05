/*
  # Cart orders + module keys + product stock

  - items: multiple line items in one business_bookings submission (a cart
    checkout), instead of the single item_id/item_name/item_price/quantity
    columns used for single-item bookings/reservations.
  - module_key: a stable per-module identifier (from categoryFeatures.ts).
    A category can now run more than one module at once (e.g. a Restaurant
    has both a "reservations" module and an "orders"/cart module) — the
    dashboard filters bookings by module_key rather than inferring it from
    item_type, which would break if two modules ever shared an itemSource.
  - stock_quantity: optional stock count on business_products, purely
    informational (no auto-decrement — there's no product edit UI yet to
    correct drift, so keep this simple until that exists).
*/

ALTER TABLE business_bookings ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE business_bookings ADD COLUMN IF NOT EXISTS module_key text;

ALTER TABLE business_bookings DROP CONSTRAINT IF EXISTS business_bookings_items_is_array;
ALTER TABLE business_bookings ADD CONSTRAINT business_bookings_items_is_array
  CHECK (items IS NULL OR jsonb_typeof(items) = 'array');

ALTER TABLE business_products ADD COLUMN IF NOT EXISTS stock_quantity int;
