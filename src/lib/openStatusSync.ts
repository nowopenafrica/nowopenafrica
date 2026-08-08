// Best-effort push of the owner's open/closed toggle to the database.
//
// resolvePublicStatus() on the public directory/profile reads business.open_status,
// so the owner's Business Clock choice needs to reach the row — otherwise the
// public badge keeps showing what the schedule says instead of what the owner
// actually did today.
//
// Fire-and-forget by design: the owner's local clock already works without the
// database, so a failed write (offline, missing table, env not configured) must
// never block or error the toggle.
import { supabase } from './supabase';

export async function syncOpenStatus(businessId: string, status: 'open' | 'closed' | null): Promise<void> {
  try {
    await supabase.from('businesses').update({ open_status: status }).eq('id', businessId);
  } catch {
    // Non-fatal — the owner's clock still reflects the choice locally.
  }
}
