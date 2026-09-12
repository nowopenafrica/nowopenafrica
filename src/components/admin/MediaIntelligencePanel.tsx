import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, RefreshCw, ShieldCheck, Trash2, X, ExternalLink } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isUnprovisionedError } from '../../lib/enrichmentOps';
import SmartImg from '../SmartImg';
import {
  MEDIA_STATUS_LABEL, MEDIA_RIGHTS_LABEL, MEDIA_REVIEW_LABEL, mediaReviewPatch,
  type MediaAssetRow, type MediaReviewAction,
} from '../../lib/mediaIntelligence';

/**
 * Admin → Oversight → Media Intelligence & Moderation.
 *
 * The human half of the §16 asset registry (business_media_assets). Discovery
 * sources only ever WRITE candidates — nothing renders until a person moves an
 * asset from discovered → approved → published here, and a takedown honour is
 * final. The engine itself is a crawler that must not be able to publish, so
 * its edge function only writes; moderation is this screen.
 */

type ReviewRow = MediaAssetRow & {
  business?: { name: string | null; username: string | null } | null;
};

type Tab = 'review' | 'published' | 'removed' | 'all';

const TABS: Tab[] = ['review', 'published', 'removed', 'all'];

const TAB_LABEL: Record<Tab, string> = {
  review: 'Needs review',
  published: 'Published',
  removed: 'Removed',
  all: 'All',
};

export default function MediaIntelligencePanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unprovisioned, setUnprovisioned] = useState(false);
  const [tab, setTab] = useState<Tab>('review');
  const [working, setWorking] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_media_assets')
      .select('*, business:businesses(name, username)')
      .order('match_confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) {
      if (isUnprovisionedError(error.message)) {
        setUnprovisioned(true);
        setRows([]);
        return;
      }
      toast.error(error.message);
      return;
    }
    setUnprovisioned(false);
    setRows((data as ReviewRow[] | null) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { review: 0, published: 0, removed: 0, all: rows.length };
    for (const r of rows) {
      if (r.status === 'published') c.published += 1;
      else if (r.status === 'removed') c.removed += 1;
      else c.review += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (tab === 'all' ? rows : rows.filter((r) => (
      tab === 'published' ? r.status === 'published'
      : tab === 'removed' ? r.status === 'removed'
      : r.status !== 'published' && r.status !== 'removed'
    ))),
    [rows, tab],
  );

  const act = async (row: ReviewRow, action: MediaReviewAction) => {
    const patch = mediaReviewPatch(action, row.status, new Date().toISOString(), user?.id ?? null, reasonFor[row.id] ?? null);
    if (!patch) { toast.error('This asset is already taken down.'); return; }
    setWorking(row.id);
    const { error } = await supabase.from('business_media_assets').update(patch).eq('id', row.id);
    setWorking(null);
    if (error) { toast.error(error.message); return; }
    setReasonFor((prev) => { const next = { ...prev }; delete next[row.id]; return next; });
    if (action === 'publish') toast.success('Published — it now renders on the profile.');
    else if (action === 'takedown') toast.success('Takedown honoured — the row stays for the record.');
    else if (action === 'reject') toast.success('Rejected.');
    else toast.success('Approved.');
    void load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Media Intelligence &amp; Moderation</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Assets discovered for business profiles. Nothing renders until a person approves and publishes it;
            taking one down is final. Moderator actions are recorded on the row.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {TAB_LABEL[t]} <span className="opacity-70">({counts[t]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin mr-2" /> Loading registry…
        </div>
      ) : unprovisioned ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center space-y-1.5">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Enrichment is not yet provisioned in this database.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            This moderation desk reads <code className="font-mono">business_media_assets</code>, created by
            the enrichment migrations (20260911000000 … 20260912020000). Until a database has them (
            <code className="font-mono">audits/APPLY_PENDING_ENRICHMENT.sql</code> provisions the whole set in one
            paste), there is nothing to moderate and nothing wrong with the app.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {tab === 'review'
            ? 'Nothing waiting. Enrichment jobs will deposit discovered assets here for a human to check.'
            : 'No assets in this state yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((row) => (
            <div key={row.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
              <div className="h-36 bg-gray-100 dark:bg-gray-900">
                <SmartImg
                  src={row.source_uri}
                  alt={row.caption ?? row.asset_type}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white truncate">
                      {row.business?.name ?? `Business ${row.business_id}`}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span className="uppercase tracking-wide text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                        {row.asset_type}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        row.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : row.status === 'removed' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                      }`}>
                        {MEDIA_STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </div>
                  </div>
                  {row.business?.username && (
                    <a
                      href={`/${row.business.username}`}
                      className="shrink-0 rounded-lg p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="View profile"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>

                {row.caption && <p className="text-sm text-gray-600 dark:text-gray-300">{row.caption}</p>}

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {row.rights_decision && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      Rights: {MEDIA_RIGHTS_LABEL[row.rights_decision] ?? row.rights_decision}
                    </span>
                  )}
                  {row.licence && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {row.licence}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    Match {row.match_confidence}
                  </span>
                </div>

                {row.source_url && (
                  <a
                    href={row.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 dark:text-blue-400 truncate hover:underline"
                  >
                    {row.source_url}
                  </a>
                )}

                {row.moderation_reason && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {row.moderation_reason}
                    {row.takedown_requested_at && ' — takedown honoured'}
                  </p>
                )}

                {row.status !== 'removed' && (
                  <div className="space-y-2">
                    <input
                      value={reasonFor[row.id] ?? ''}
                      onChange={(e) => setReasonFor((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="Reason (for reject / takedown)"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex flex-wrap gap-2">
                      {row.status === 'published' ? (
                        <button
                          onClick={() => void act(row, 'takedown')}
                          disabled={working === row.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                        >
                          {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                          Takedown
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => void act(row, 'approve')}
                            disabled={working === row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                          >
                            {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                            {MEDIA_REVIEW_LABEL.approve}
                          </button>
                          <button
                            onClick={() => void act(row, 'publish')}
                            disabled={working === row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                            {MEDIA_REVIEW_LABEL.publish}
                          </button>
                          <button
                            onClick={() => void act(row, 'reject')}
                            disabled={working === row.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            {working === row.id ? <Loader2 className="animate-spin" size={14} /> : <X size={14} />}
                            {MEDIA_REVIEW_LABEL.reject}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}