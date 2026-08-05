import { supabase } from './supabase';

// Append an entry to the admin audit log. Best-effort — never throws, so a
// missing table or transient error can't break the action being audited. RLS
// restricts inserts to admins (WITH CHECK is_admin() AND actor_id = auth.uid()).
export async function logAudit(
  actor: { id?: string | null; email?: string | null } | null | undefined,
  action: string,
  entityType?: string,
  entityId?: string | null,
  detail?: Record<string, unknown>,
) {
  if (!actor?.id) return;
  try {
    await supabase.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email ?? null,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId != null ? String(entityId) : null,
      detail: detail ?? null,
    });
  } catch {
    /* table may not exist yet, or non-admin — ignore */
  }
}
