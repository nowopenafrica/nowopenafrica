import { supabase } from './supabase';

// User-facing dashboard notifications (plan changes, admin messages, etc.).
// Backed by the `notifications` table. Every call is best-effort and degrades
// gracefully if the table hasn't been created yet (returns empty / no-throw),
// so the dashboard keeps working before the migration is applied.

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string; // info | success | warning | plan | booking
  link: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(userId: string, limit = 20): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Table missing / RLS not applied yet — don't break the dashboard.
    return [];
  }
  return (data as AppNotification[]) || [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
}

// Create a notification for a user. Admins may target any user (RLS-gated);
// a user may create their own. Returns false on failure without throwing.
export async function createNotification(input: {
  userId: string;
  title: string;
  body?: string;
  type?: string;
  link?: string;
}): Promise<boolean> {
  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    title: input.title,
    body: input.body ?? null,
    type: input.type ?? 'info',
    link: input.link ?? null,
  });
  if (error) {
    console.warn('Could not create notification:', error.message);
    return false;
  }
  return true;
}
