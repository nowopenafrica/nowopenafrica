import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ExternalLink, Film, FolderOpen, Image as ImageIcon, Loader2, RefreshCw, Wand2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { formatLagos } from '../../lib/brandSocial';

/**
 * Drive library — everything in the team's Google Drive content folder, as the
 * hourly sync (brand-social-drive-sync) has recorded it.
 *
 * Files added to Drive after 18 Nov 2026 become drafts on their own. Files that
 * were already there are 'library': pick the ones worth posting here and
 * "Make drafts" copies them into our storage and puts a draft in the Queue.
 * A draft from Drive starts with a [bracketed] caption, which the checks block,
 * so it cannot publish until someone writes the caption and approves it.
 */

interface MediaRow {
  id: string; drive_file_id: string; name: string; folder_path: string; kind: 'image' | 'video' | 'other';
  drive_modified: string | null; status: 'library' | 'imported' | 'skipped' | 'failed'; storage_url: string | null;
  content_id: string | null; note: string | null; first_seen_at: string;
}
interface Source { label: string; drive_folder_id: string; last_synced_at: string | null; last_result: { error?: string } | null }

const PAGE = 48;
const IMPORT_CHUNK = 8; // the function imports at most this many per call

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-[44px] text-sm font-semibold transition disabled:opacity-50';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
const btnQuiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`;
const select = 'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white min-h-[44px]';

const STATUS_LABEL: Record<MediaRow['status'], string> = { library: 'Not used yet', imported: 'Draft made', skipped: 'Skipped', failed: 'Failed' };

async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return String(b.error); } catch { /* fall through */ }
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

/** Drive serves a thumbnail for files shared "anyone with the link", videos included. */
const thumb = (r: MediaRow) => (r.kind === 'image' && r.storage_url) ? r.storage_url : `https://drive.google.com/thumbnail?id=${encodeURIComponent(r.drive_file_id)}&sz=w400`;

export default function BrandDriveLibrary({ onDrafted }: { onDrafted: () => void }) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [folder, setFolder] = useState('all');
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('video');
  const [status, setStatus] = useState<'all' | MediaRow['status']>('library');
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'sync' | 'import' | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // PostgREST caps a response at 1000 rows; page with a tiebreaker.
    const all: MediaRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('brand_social_media')
        .select('id, drive_file_id, name, folder_path, kind, drive_modified, status, storage_url, content_id, note, first_seen_at')
        .order('first_seen_at', { ascending: false }).order('id').range(from, from + 999);
      if (error) { setErr(error.message); setLoading(false); return; }
      all.push(...(data as MediaRow[]));
      if (!data || data.length < 1000) break;
    }
    const { data: src, error: se } = await supabase.from('brand_social_media_sources').select('label, drive_folder_id, last_synced_at, last_result');
    if (se) { setErr(se.message); setLoading(false); return; }
    const ids = all.map((r) => r.content_id).filter(Boolean) as string[];
    const map: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: ce } = await supabase.from('brand_social_content').select('id, code').in('id', ids.slice(i, i + 200));
      if (ce) { setErr(ce.message); setLoading(false); return; }
      for (const c of data ?? []) map[c.id] = c.code;
    }
    setRows(all); setSources((src ?? []) as Source[]); setCodes(map); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const folders = useMemo(() => [...new Set(rows.map((r) => r.folder_path))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter((r) =>
    r.kind !== 'other'
    && (folder === 'all' || r.folder_path === folder)
    && (kind === 'all' || r.kind === kind)
    && (status === 'all' || r.status === status)), [rows, folder, kind, status]);
  useEffect(() => { setShown(PAGE); }, [folder, kind, status]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const syncNow = async () => {
    setBusy('sync');
    const { data, error } = await supabase.functions.invoke('brand-social-drive-sync', { body: { action: 'sync' } });
    setBusy(null);
    if (error) { toast.error(await fnError(error)); return; }
    const r = data?.results?.[0];
    if (r?.error) toast.error(r.error);
    else toast.success(`Checked ${r?.files ?? 0} files: ${r?.new_files ?? 0} new, ${(r?.imported ?? []).filter((x: { ok: boolean }) => x.ok).length} drafted.`);
    void load(); onDrafted();
  };

  const makeDrafts = async () => {
    const ids = [...picked];
    setBusy('import');
    let made = 0; const failed: string[] = [];
    for (let i = 0; i < ids.length; i += IMPORT_CHUNK) {
      const { data, error } = await supabase.functions.invoke('brand-social-drive-sync', { body: { action: 'import', ids: ids.slice(i, i + IMPORT_CHUNK) } });
      if (error) { failed.push(await fnError(error)); break; }
      for (const x of data?.imported ?? []) { if (x.ok) made++; else failed.push(`${x.name}: ${x.error}`); }
    }
    setBusy(null); setPicked(new Set());
    if (made) toast.success(`${made} draft${made === 1 ? '' : 's'} added to the Queue. Write each caption, then approve.`);
    if (failed.length) toast.error(failed.slice(0, 2).join(' · '));
    void load(); onDrafted();
  };

  if (loading) return <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading the Drive library…</p>;
  if (err) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> The Drive library could not be loaded.</p>
        <p className="mt-1">{err}</p>
      </div>
    );
  }

  const src = sources[0];
  const lastError = src?.last_result?.error;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm text-gray-700 dark:text-gray-200">
          <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><FolderOpen size={16} /> {src?.label ?? 'No Drive folder connected'}</p>
          <p className="mt-1">Checked every hour. New files become drafts on their own; files already here wait for you to pick them.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Last checked {formatLagos(src?.last_synced_at)} · {rows.length} files
            {src && <> · <a className="underline" href={`https://drive.google.com/drive/folders/${src.drive_folder_id}`} target="_blank" rel="noreferrer">Open in Drive</a></>}
          </p>
          {lastError && <p className="mt-1 text-xs text-red-700 dark:text-red-300">Last check failed: {lastError}</p>}
        </div>
        <button type="button" className={btnQuiet} onClick={() => void syncNow()} disabled={busy !== null}>
          {busy === 'sync' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Check Drive now
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <select className={select} aria-label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)}>
          <option value="all">All folders</option>
          {folders.map((f) => <option key={f} value={f}>{f.split('/').slice(1).join(' / ') || 'Top level'}</option>)}
        </select>
        <select className={select} aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="all">Images and videos</option><option value="video">Videos</option><option value="image">Images</option>
        </select>
        <select className={select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="library">Not used yet</option><option value="imported">Draft made</option><option value="failed">Failed</option><option value="all">Everything</option>
        </select>
        <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} shown</span>
      </div>

      {picked.size > 0 && (
        <div className="sticky top-2 z-10 rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 p-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">{picked.size} selected. Each becomes a Facebook and Instagram draft{[...picked].some((id) => rows.find((r) => r.drive_file_id === id)?.kind === 'video') ? ' (videos as Reels)' : ''}.</p>
          <div className="flex gap-2">
            <button type="button" className={`${btn} border border-white/40 dark:border-gray-900/30`} onClick={() => setPicked(new Set())} disabled={busy !== null}>Clear</button>
            <button type="button" className={btnPrimary} onClick={() => void makeDrafts()} disabled={busy !== null}>
              {busy === 'import' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Make drafts
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Watch or open each file before you post it. Several were made before launch and may carry “early access”, countdown or placeholder text inside the picture, which no caption check can see.
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nothing here with these filters.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.slice(0, shown).map((r) => {
            const selectable = r.status === 'library' || r.status === 'failed';
            const on = picked.has(r.drive_file_id);
            return (
              <li key={r.id} className={`rounded-xl border overflow-hidden bg-white dark:bg-gray-800 ${on ? 'border-blue-600 ring-2 ring-blue-600' : 'border-gray-200 dark:border-gray-700'}`}>
                <button type="button" className="block w-full text-left disabled:cursor-default" disabled={!selectable} onClick={() => toggle(r.drive_file_id)}
                  aria-pressed={selectable ? on : undefined} aria-label={selectable ? `${on ? 'Unselect' : 'Select'} ${r.name}` : r.name}>
                  <div className="relative aspect-[4/5] bg-gray-100 dark:bg-gray-900">
                    <img src={thumb(r)} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 text-white text-xs px-2 py-1 flex items-center gap-1">
                      {r.kind === 'video' ? <Film size={12} /> : <ImageIcon size={12} />} {r.kind === 'video' ? 'Video' : 'Image'}
                    </span>
                    {selectable && (
                      <span className={`absolute right-2 top-2 h-6 w-6 rounded-full border-2 ${on ? 'bg-blue-600 border-blue-600' : 'bg-white/80 border-white'}`} aria-hidden="true" />
                    )}
                  </div>
                </button>
                <div className="p-2 text-xs space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-white break-all line-clamp-2" title={r.name}>{r.name}</p>
                  <p className="text-gray-500 dark:text-gray-400">{r.folder_path.split('/').slice(1).join(' / ') || 'Top level'}{r.drive_modified ? ` · ${r.drive_modified}` : ''}</p>
                  <p className={r.status === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-300'}>
                    {STATUS_LABEL[r.status]}{r.content_id && codes[r.content_id] ? ` · ${codes[r.content_id]}` : ''}{r.status === 'failed' && r.note ? `: ${r.note}` : ''}
                  </p>
                  <a className="inline-flex items-center gap-1 underline text-gray-700 dark:text-gray-200 min-h-[32px]" href={`https://drive.google.com/file/d/${r.drive_file_id}/view`} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> {r.kind === 'video' ? 'Watch' : 'View'} in Drive
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > shown && (
        <button type="button" className={btnQuiet} onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} left)</button>
      )}
    </div>
  );
}
