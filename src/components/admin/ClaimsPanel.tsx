import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, Check, Clock, ExternalLink, RefreshCw, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Business claims — the screen that did not exist.
 *
 * ── WHY THIS IS HERE ─────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-06, auditing the acquisition funnel end to end:
 *
 *   businesses                 3,906
 *   owned by somebody              2
 *   claims ever filed              0
 *   admin screens for claims       0   ← of 27 admin tabs
 *
 * `ClaimBusiness` lets an owner file a claim, the database handles it
 * correctly (verified: a claim starts pending, stays private to its claimant,
 * and approving it transfers ownership and marks the listing claimed), and
 * `chiefOfStaff` counts "Claims waiting for review".
 *
 * Nothing rendered them. A claim could be filed and then sat in the table
 * forever, because no person could see it.
 *
 * That matters most right now: the whole acquisition thesis is Radar discovers
 * a business → the owner is told → the owner claims it. Switching on outreach
 * before this screen existed would have invited thousands of businesses
 * through a door that opens onto nothing.
 *
 * ── APPROVAL IS A DATABASE TRIGGER, NOT CODE HERE ────────────────────────
 *
 * Setting status to 'approved' fires `trg_apply_business_claim`, which assigns
 * the owner and flips claim_status. This panel never writes `businesses` — it
 * records a decision and lets the trigger do what it already does correctly.
 */

type Status = 'pending' | 'approved' | 'rejected';

const TONE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  rejected: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

interface ClaimRow {
  id: string;
  business_id: string;
  user_id: string;
  evidence: string | null;
  contact: string | null;
  status: Status;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface Decorated extends ClaimRow {
  businessName: string;
  businessLocation: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  businessWebsite: string | null;
  claimantEmail: string | null;
  claimantName: string | null;
}

/** Claims per page. Enough to work through, far under PostgREST's 1,000 cap. */
const PAGE = 50;

export default function ClaimsPanel() {
  const [rows, setRows] = useState<Decorated[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [working, setWorking] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Decorated | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('business_claims')
      .select('id,business_id,user_id,evidence,contact,status,note,created_at,reviewed_at')
      .order('created_at', { ascending: false })
      // `id` breaks ties: claims filed in the same second would otherwise
      // order differently between pages.
      .order('id', { ascending: false })
      .range(0, PAGE - 1);
    if (filter !== 'all') q = q.eq('status', filter);

    const { data, error } = await q;
    if (error) { setLoading(false); toast.error(error.message); return; }

    const claims = (data ?? []) as ClaimRow[];
    if (claims.length === 0) { setRows([]); setLoading(false); return; }

    /*
     * The business and the claimant, fetched separately rather than through a
     * PostgREST embed. `business_claims` has no FK relationship declared to
     * `users`, and an embed that cannot resolve fails the WHOLE select — the
     * trap that has bitten this codebase before. Two plain reads always work.
     */
    const bizIds = [...new Set(claims.map((c) => c.business_id))];
    const userIds = [...new Set(claims.map((c) => c.user_id))];

    const [bizRes, userRes] = await Promise.all([
      supabase.from('businesses')
        .select('id,name,location,phone,email,website')
        .in('id', bizIds),
      supabase.from('users').select('id,email,name').in('id', userIds),
    ]);

    const biz = new Map((bizRes.data ?? []).map((b: Record<string, string>) => [b.id, b]));
    const usr = new Map((userRes.data ?? []).map((u: Record<string, string>) => [u.id, u]));

    setRows(claims.map((c) => {
      const b = biz.get(c.business_id);
      const u = usr.get(c.user_id);
      return {
        ...c,
        businessName: b?.name ?? '(listing not found)',
        businessLocation: b?.location ?? null,
        businessPhone: b?.phone ?? null,
        businessEmail: b?.email ?? null,
        businessWebsite: b?.website ?? null,
        claimantEmail: u?.email ?? null,
        claimantName: u?.name ?? null,
      };
    }));
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (claim: Decorated, status: Status, note?: string) => {
    setWorking(claim.id);
    const { error } = await supabase
      .from('business_claims')
      .update({ status, note: note ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', claim.id);
    setWorking(null);

    if (error) { toast.error(error.message); return; }
    toast.success(status === 'approved'
      // Said precisely: approving hands somebody control of a real listing.
      ? `${claim.businessName} now belongs to ${claim.claimantEmail ?? 'the claimant'}`
      : `Claim on ${claim.businessName} rejected`);
    void load();
  };

  /**
   * Does the claimant's stated contact match anything on the listing?
   *
   * Not a verdict — a prompt. A match is good evidence and no match is not
   * proof of anything, because a real owner may well sign up with a personal
   * address. It is shown so the person deciding does not have to compare two
   * columns by eye.
   */
  const contactMatch = (c: Decorated): { matched: boolean; how: string } | null => {
    const digits = (s: string | null) => (s ?? '').replace(/\D/g, '');
    const claimant = [c.contact, c.claimantEmail].filter(Boolean).map((v) => String(v).toLowerCase());
    if (claimant.length === 0) return null;

    if (c.businessEmail && claimant.includes(c.businessEmail.toLowerCase())) {
      return { matched: true, how: 'matches the email on the listing' };
    }
    const bizDigits = digits(c.businessPhone);
    if (bizDigits.length >= 10 && claimant.some((v) => digits(v) === bizDigits)) {
      return { matched: true, how: 'matches the phone on the listing' };
    }
    const domain = (c.businessWebsite ?? '').replace(/^https?:\/\/(www\.)?/i, '').split('/')[0].toLowerCase();
    if (domain && c.claimantEmail && c.claimantEmail.toLowerCase().endsWith(`@${domain}`)) {
      return { matched: true, how: 'uses an address at the listing’s own domain' };
    }
    return { matched: false, how: 'does not match any contact detail on the listing' };
  };

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BadgeCheck size={18} /> Business claims
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-2xl">
            People saying a listing is theirs. Approving hands them control of it — the listing
            becomes theirs to edit, and nobody else can claim it afterwards.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-60 min-h-[44px]">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 min-h-[36px] rounded-lg text-[12px] font-semibold capitalize transition-colors
              ${filter === f
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {f}
          </button>
        ))}
        {filter === 'pending' && pendingCount > 0 && (
          <span className="text-[12px] text-gray-500">{pendingCount} waiting</span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-8">Loading claims…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {filter === 'pending' ? 'No claims waiting.' : `No ${filter} claims.`}
          </p>
          {/*
            * Said plainly rather than left as an ambiguous empty state. Zero
            * claims is the expected reading while no owner has been told their
            * listing exists — it is a fact about outreach, not about this screen.
            */}
          <p className="text-[12px] text-gray-500 mt-1">
            Claims arrive when a business owner finds their listing and presses
            “Is this your business?”.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const match = contactMatch(c);
            return (
              <li key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                      {c.businessName}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${TONE[c.status]}`}>
                        {c.status}
                      </span>
                      <a href={`/businesses/${c.business_id}`} target="_blank" rel="noopener noreferrer"
                         className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        View <ExternalLink size={11} />
                      </a>
                    </p>
                    {c.businessLocation && (
                      <p className="text-[12px] text-gray-500">{c.businessLocation}</p>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 shrink-0">
                    <Clock size={11} /> {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>

                <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">Claimant</dt>
                    <dd className="text-gray-900 dark:text-white truncate">
                      {c.claimantName ? `${c.claimantName} · ` : ''}{c.claimantEmail ?? c.user_id}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">They gave</dt>
                    <dd className="text-gray-900 dark:text-white truncate">{c.contact || '—'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">Listing has</dt>
                    <dd className="text-gray-700 dark:text-gray-300 truncate">
                      {[c.businessPhone, c.businessEmail].filter(Boolean).join(' · ') || 'no contact details'}
                    </dd>
                  </div>
                </dl>

                {c.evidence && (
                  <p className="mt-2 text-[12px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2">
                    “{c.evidence}”
                  </p>
                )}

                {match && (
                  <p className={`mt-2 text-[11px] font-semibold ${
                    match.matched ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {match.matched ? '✓ Their contact ' : '• Their contact '}{match.how}.
                    {!match.matched && ' That is not disqualifying — ask them before deciding.'}
                  </p>
                )}

                {c.status === 'pending' && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => void decide(c, 'approved')}
                      disabled={working === c.id}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-bold disabled:opacity-60">
                      <Check size={13} /> Approve — hand over the listing
                    </button>
                    <button
                      onClick={() => setRejecting(c)}
                      disabled={working === c.id}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[38px] rounded-lg border border-gray-300 dark:border-gray-600 text-[12px] font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-60">
                      <X size={13} /> Reject
                    </button>
                  </div>
                )}

                {c.note && (
                  <p className="mt-2 text-[11px] text-gray-500">Note: {c.note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        * Approving is the irreversible half and gets no dialog — it is the
        * expected outcome and the button says what it does. REJECTING is the
        * one that tells somebody "no", so it is confirmed.
        */}
      <ConfirmDialog
        open={!!rejecting}
        title="Reject this claim?"
        message={
          <>
            <strong className="text-gray-900 dark:text-white">{rejecting?.claimantEmail}</strong> will
            not be given control of <strong className="text-gray-900 dark:text-white">{rejecting?.businessName}</strong>.
            They can claim it again later.
          </>
        }
        confirmLabel="Reject claim"
        onConfirm={() => { if (rejecting) void decide(rejecting, 'rejected'); setRejecting(null); }}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
