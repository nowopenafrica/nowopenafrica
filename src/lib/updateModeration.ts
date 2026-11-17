// Business Updates — staff moderation (Admin Console → Updates).
//
// Admin-only by the database, not by this file: reports are readable and
// changeable only under is_admin(), and the lifecycle guard lets only an admin
// change moderation_status (it also stamps moderated_by and moderated_at).
//
// Hiding records the reason the owner will see, closes the open reports as
// "actioned" and puts one notification in the owner's bell. Dismissing closes
// the reports as "rejected" and tells nobody: a report the staff found
// groundless is not news to the business. A failed read is reported as a
// failure, never as an empty queue.

import { supabase } from './supabase';
import { SIGNED_URL_MAX_TTL_S, type UpdateType } from './businessUpdates';

export interface ModUpdate {
  id: string;
  type: UpdateType;
  title: string;
  body: string;
  published_at: string | null;
  expires_at: string | null;
  ended_at: string | null;
  moderation_status: 'ok' | 'hidden';
  moderation_note: string | null;
  media: { id: string; kind: 'image' | 'video'; storage_path: string; position: number; alt_text: string | null }[];
}

export interface ModItem {
  update: ModUpdate;
  business: { id: string; name: string; username: string | null; user_id: string | null };
  reports: { reason: string; detail: string | null; created_at: string }[];
  /** First photo, signed for staff; null when there is none or signing failed. */
  thumb: string | null;
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const SELECT = 'id, type, title, body, published_at, expires_at, ended_at, moderation_status, moderation_note, '
  + 'media:business_update_media(id, kind, storage_path, position, alt_text), '
  + 'business:businesses(id, name, username, user_id)';

type Row = ModUpdate & { business: ModItem['business'] };

const MIN_REASON = 5;

async function withThumbs(items: ModItem[]): Promise<ModItem[]> {
  const firsts = items
    .map((i) => ({ item: i, path: [...i.update.media].sort((a, b) => a.position - b.position).find((m) => m.kind === 'image')?.storage_path }))
    .filter((x): x is { item: ModItem; path: string } => Boolean(x.path));
  if (firsts.length === 0) return items;
  const { data, error } = await supabase.storage.from('business-updates')
    .createSignedUrls(firsts.map((f) => f.path), SIGNED_URL_MAX_TTL_S);
  // A missing picture never blocks a moderation decision; the text is what is judged.
  if (error || !data) return items;
  const byPath = new Map(data.filter((d) => !d.error && d.signedUrl).map((d) => [d.path, d.signedUrl]));
  for (const f of firsts) f.item.thumb = byPath.get(f.path) ?? null;
  return items;
}

const toItem = (r: Row, reports: ModItem['reports'] = []): ModItem => {
  const { business, ...update } = r;
  return { update, business, reports, thumb: null };
};

export async function listModeration(): Promise<Result<{ reported: ModItem[]; live: ModItem[]; hidden: ModItem[] }>> {
  const { data: reportRows, error: reportError } = await supabase
    .from('business_update_reports')
    .select('update_id, reason, detail, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(500);
  if (reportError || !reportRows) return { ok: false, message: 'Reports could not be read.' };

  const byUpdate = new Map<string, ModItem['reports']>();
  for (const r of reportRows as { update_id: string; reason: string; detail: string | null; created_at: string }[]) {
    const list = byUpdate.get(r.update_id) ?? [];
    list.push({ reason: r.reason, detail: r.detail, created_at: r.created_at });
    byUpdate.set(r.update_id, list);
  }

  const nowIso = new Date().toISOString();
  const [reportedRes, liveRes, hiddenRes] = await Promise.all([
    byUpdate.size > 0
      ? supabase.from('business_updates').select(SELECT).in('id', [...byUpdate.keys()])
      : Promise.resolve({ data: [], error: null }),
    supabase.from('business_updates').select(SELECT)
      .not('published_at', 'is', null).lte('published_at', nowIso).gt('expires_at', nowIso)
      .is('ended_at', null).eq('moderation_status', 'ok')
      .order('published_at', { ascending: false }).limit(50),
    supabase.from('business_updates').select(SELECT)
      .eq('moderation_status', 'hidden')
      .order('moderated_at', { ascending: false }).limit(50),
  ]);
  if (reportedRes.error || liveRes.error || hiddenRes.error) return { ok: false, message: 'Updates could not be read.' };

  const rows = (x: { data: unknown }) => ((x.data as unknown as Row[] | null) ?? []);
  // Oldest report first: the person who waited longest is answered first.
  const reported = rows(reportedRes)
    .map((r) => toItem(r, byUpdate.get(r.id) ?? []))
    .sort((a, b) => Date.parse(a.reports[0]?.created_at ?? '') - Date.parse(b.reports[0]?.created_at ?? ''));
  const live = rows(liveRes).map((r) => toItem(r));
  const hidden = rows(hiddenRes).map((r) => toItem(r));

  await withThumbs([...reported, ...live, ...hidden]);
  return { ok: true, value: { reported, live, hidden } };
}

async function notifyOwner(item: ModItem, title: string, body: string): Promise<string | undefined> {
  if (!item.business.user_id) return undefined;
  // No .select(): admins may write any notification, but cannot read others back.
  const { error } = await supabase.from('notifications').insert({
    user_id: item.business.user_id,
    title,
    body,
    type: 'moderation',
    link: `/dashboard?open=updates&business=${item.business.id}`,
  });
  return error ? 'The owner could not be notified; tell them another way.' : undefined;
}

export async function hideUpdate(item: ModItem, reason: string): Promise<Result<{ warning?: string }>> {
  const note = reason.trim();
  if (note.length < MIN_REASON) return { ok: false, message: 'Give the owner a reason (at least 5 characters).' };

  const { error } = await supabase.from('business_updates')
    .update({ moderation_status: 'hidden', moderation_note: note.slice(0, 500) })
    .eq('id', item.update.id);
  if (error) return { ok: false, message: 'The update could not be hidden. Nothing has changed.' };

  const { error: reportError } = await supabase.from('business_update_reports')
    .update({ status: 'actioned', reviewed_at: new Date().toISOString() })
    .eq('update_id', item.update.id)
    .eq('status', 'open');
  const warning = await notifyOwner(item, 'An update was hidden by NowOpen', note.slice(0, 500));
  return {
    ok: true,
    value: { warning: reportError ? 'Hidden, but its reports are still open.' : warning },
  };
}

/** Whether unhiding would actually show it again: published, not ended, inside its 24 hours. */
export function wouldBeLive(u: ModUpdate, now: Date = new Date()): boolean {
  return Boolean(u.published_at && u.expires_at && !u.ended_at
    && Date.parse(u.published_at) <= now.getTime() && Date.parse(u.expires_at) > now.getTime());
}

export async function unhideUpdate(item: ModItem): Promise<Result<{ warning?: string; stillLive: boolean }>> {
  const { error } = await supabase.from('business_updates')
    .update({ moderation_status: 'ok', moderation_note: null })
    .eq('id', item.update.id);
  if (error) return { ok: false, message: 'The update could not be unhidden. Nothing has changed.' };
  // Never "visible again" for an update whose time has passed: nothing would be.
  const stillLive = wouldBeLive(item.update);
  const warning = stillLive
    ? await notifyOwner(item, 'Your update is visible again',
      'NowOpen reviewed it again. It is shown until its 24 hours end.')
    : await notifyOwner(item, 'NowOpen reviewed your update again',
      'It is no longer hidden, but its 24 hours had already ended, so it stays in your archive.');
  return { ok: true, value: { warning, stillLive } };
}

export async function dismissReports(updateId: string): Promise<Result<Record<string, never>>> {
  const { error } = await supabase.from('business_update_reports')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
    .eq('update_id', updateId)
    .eq('status', 'open');
  if (error) return { ok: false, message: 'The reports could not be dismissed.' };
  return { ok: true, value: {} };
}
