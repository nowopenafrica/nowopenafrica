import { useState } from 'react';
import toast from 'react-hot-toast';
import { Instagram, Loader2, Search, ExternalLink, AlertTriangle, Info, Inbox } from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import { buildInstagramCandidate } from '../../../lib/instagramCandidate';
import { readCaptions, type CaptionFindings } from '../../../lib/instagramCaptions';

/**
 * Instagram manual extraction — one handle, looked up officially.
 *
 * ── WHAT THIS CAN DO, STATED ONCE ────────────────────────────────────────
 *
 * An operator pastes a handle they already have and this reads that account
 * through Meta's official business_discovery endpoint.
 *
 * It cannot search. Verified against Meta's documentation 2026-10-06:
 * business_discovery takes a USERNAME and returns that account's public
 * profile; there is no authorised endpoint that searches Instagram by
 * location, category or keyword. So this is a lookup for a handle from a
 * business card, a shopfront or a website footer — not a way to find
 * businesses nobody has named.
 *
 * ── AND WHAT IT WILL SAY TODAY ───────────────────────────────────────────
 *
 * No Meta credentials are configured, so the server returns `not_configured`
 * and this renders the setup requirements. That is the honest state and it is
 * rendered as such: there is no mock, no sample profile and no demo result
 * anywhere in this component.
 */

interface Evidence {
  field: string;
  value: string;
  confidence: number;
  source_id: string;
  source_url: string;
  observed_at: string;
}

interface Media {
  id: string;
  caption: string | null;
  permalink: string | null;
  mediaType: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
}

interface Profile {
  media?: Media[];
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  retrievedAt: string;
}

type Result =
  | { ok: true; handle: string; url: string; profile: Profile; evidence: Evidence[];
      duplicate: { id: string; name: string; claimStatus: string } | null }
  | { ok: false; stage?: string; reason: string; missing?: string[]; providerConfigured?: boolean };

const FIELD_LABEL: Record<string, string> = {
  name: 'Business name',
  website: 'Website',
  description: 'Description',
};

/**
 * One proposed value, off until somebody turns it on.
 *
 * Named Chip rather than Pick because `Pick` is a TypeScript built-in and the
 * collision is a compile error, not a style question.
 */
/**
 * A caption finding, which is one of three things: ignored, a service, or a
 * product. Cycling one control beats two checkboxes per row for a list an
 * operator mostly skips.
 */
function OfferChip({ label, state, onCycle }: {
  label: string; state: 'off' | 'service' | 'product'; onCycle: () => void;
}) {
  const tone = state === 'service'
    ? 'bg-nowopen-500 text-white border-nowopen-500'
    : state === 'product'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';
  return (
    <button
      onClick={onCycle}
      /* Stated, because the colour alone does not say which is which. */
      title={state === 'off' ? 'Not carried' : state === 'service' ? 'Carried as a service' : 'Carried as a product'}
      className={`rounded-full px-3 py-1.5 text-[12px] border min-h-[32px] max-w-full truncate ${tone}`}
    >
      {state === 'service' ? 'Service: ' : state === 'product' ? 'Product: ' : ''}{label}
    </button>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-[12px] border min-h-[32px] max-w-full truncate ${
        on
          ? 'bg-nowopen-500 text-white border-nowopen-500'
          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
      }`}
    >
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

export default function InstagramExtract() {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [importing, setImporting] = useState(false);
  /**
   * Separate consent for the account holder's own writing.
   *
   * The biography is somebody's copy. Unticked it is read, shown on screen,
   * and simply not carried onto the profile — the same split the website
   * extractor makes between facts and authored work.
   */
  const [authoredConfirmed, setAuthoredConfirmed] = useState(false);
  /** The candidate already on file for this handle, looked up when it is read. */
  const [staged, setStaged] = useState<{ id: string; status: string } | null>(null);
  /*
   * What the caption reader FOUND, and what a person has CONFIRMED. Kept
   * apart on purpose: the first is a proposal, the second is the only thing
   * that reaches a listing.
   */
  const [findings, setFindings] = useState<CaptionFindings | null>(null);
  const [pickedOfferings, setPickedOfferings] = useState<Set<string>>(new Set());
  /*
   * Products are tracked separately from services because they publish to
   * different tables and read differently on a listing: a salon offers
   * services, a shop sells products, and filing one as the other describes
   * the business wrongly.
   */
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(new Set());
  const [pickedPhone, setPickedPhone] = useState<string | null>(null);
  const [pickedEmail, setPickedEmail] = useState<string | null>(null);
  const [pickedWhatsapp, setPickedWhatsapp] = useState<string | null>(null);
  const [carryPosts, setCarryPosts] = useState(true);
  /*
   * The logo is its own decision, not part of the description one.
   *
   * A profile picture is a business's mark. Carrying it asserts a right that
   * the account's wording does not, and radar_sources records
   * image_reuse_allowed = 'prohibited' for this source — so it gets its own
   * box, unticked, and the copy on screen says what is being claimed.
   */
  const [carryLogo, setCarryLogo] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  const run = async () => {
    const v = handle.trim();
    if (!v) { toast.error('Paste an Instagram handle first.'); return; }
    setBusy(true);
    setResult(null);

    setAuthoredConfirmed(false);
    setStaged(null);
    setFindings(null);
    setPickedOfferings(new Set());
    setPickedProducts(new Set());
    setPickedPhone(null);
    setPickedEmail(null);
    setPickedWhatsapp(null);
    setCarryLogo(false);

    const { data, error } = await supabase.functions.invoke('extract-instagram', { body: { handle: v } });
    setBusy(false);

    if (error) {
      // supabase-js resolves with {data,error}; a .catch() here never fires.
      setResult({ ok: false, reason: error.message || 'The extractor could not be reached.' });
      return;
    }
    const parsed = data as Result;
    setResult(parsed);

    /*
     * Read the captions the account published. Nothing here is applied: it
     * fills a list of proposals that start UNTICKED.
     */
    if (parsed.ok) setFindings(readCaptions(parsed.profile.media ?? []));

    /*
     * Ask now, not at import time. An operator who learns "this is already on
     * file" only after ticking boxes and pressing the button has been made to
     * do the work twice.
     */
    if (parsed.ok) {
      const { data: row } = await supabase
        .from('radar_candidates')
        .select('id,status')
        .eq('source_key', 'manual_extraction')
        .eq('source_record_id', parsed.url)
        .maybeSingle();
      setStaged((row as { id: string; status: string } | null) ?? null);
    }
  };

  const addToQueue = async () => {
    if (!result?.ok) return;
    /*
     * Copy the picture BEFORE building the row, so it carries a stable URL.
     *
     * Meta's address expires within days; the endpoint fetches the bytes
     * server-side and returns one of ours. A failure here must not lose the
     * rest of the extraction, so it is reported and the filing continues
     * without a logo — an operator who has confirmed ten fields should not
     * lose them because one image fetch timed out.
     */
    let logoUrl: string | null = null;
    if (carryLogo) {
      setLogoBusy(true);
      const { data: logo, error: logoErr } = await supabase.functions.invoke('instagram-logo', {
        body: { handle: result.handle },
      });
      setLogoBusy(false);
      if (logoErr || !logo?.ok) {
        toast.error(`The logo was not copied: ${logoErr?.message ?? logo?.reason ?? 'unknown error'}`);
      } else {
        logoUrl = logo.logoUrl as string;
      }
    }

    const row = buildInstagramCandidate(result.handle, result.profile, {
      authoredConfirmed,
      confirmedOfferings: [...pickedOfferings],
      confirmedProducts: [...pickedProducts],
      phone: pickedPhone,
      email: pickedEmail,
      whatsapp: pickedWhatsapp,
      permalinks: carryPosts
        ? (result.profile.media ?? []).map((m) => m.permalink ?? '').filter(Boolean)
        : [],
      logoUrl,
    });
    if (!row) {
      toast.error('This profile has no business name, so there is nothing to file.');
      return;
    }
    setImporting(true);

    /*
     * Re-reading a handle UPDATES the candidate; it does not file it twice,
     * and it does not overwrite a decision somebody already made.
     *
     * A blind upsert would rewrite `status` too, dragging a published or
     * rejected candidate back to pending and undoing a human judgement — so
     * the decided states are left alone and the operator is told why.
     */
    let error: { message: string } | null = null;
    let verb = 'Added to the review queue';

    if (staged) {
      if (['published', 'merged', 'rejected'].includes(String(staged.status))) {
        setImporting(false);
        toast.error(
          `@${result.handle} is already on file and has been ${staged.status}. `
          + 'Edit it in the Review tab rather than filing it again.',
        );
        return;
      }
      ({ error } = await supabase.from('radar_candidates').update(row).eq('id', staged.id));
      verb = 'Updated in the review queue';
    } else {
      /*
       * No .select() after the insert. On these tables that makes RLS evaluate
       * a read the writer may not have, which kills the write — and the error
       * blames the insert.
       */
      ({ error } = await supabase.from('radar_candidates').insert(row));
    }

    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${verb}. Approve it there to create the listing.`);
    setStaged({ id: staged?.id ?? 'new', status: 'pending' });
  };

  const notConfigured = result && !result.ok && result.providerConfigured === false;

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-[13px] text-gray-500 dark:text-gray-400">
        Read one Instagram business profile through Meta&rsquo;s official API. Paste a handle you
        already have — this looks up an account, it does not search Instagram, because no
        authorised endpoint does.
      </p>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Instagram handle</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void run(); }}
              /* Every form the server normalises, so an operator never has to
                 strip an @ or a share-link query string by hand. */
              placeholder="@businessname, businessname, or instagram.com/businessname"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 pl-9 pr-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-nowopen-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-50 min-h-[44px]"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {busy ? 'Reading…' : 'Read this profile'}
          </button>
        </div>
      </div>

      {/*
        * The provider is not connected. This is the state the platform is
        * actually in, so it gets the most careful treatment on the screen:
        * what is missing, and what else is required beyond the secrets.
        */}
      {notConfigured && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-100">
            <AlertTriangle size={16} /> Instagram extraction is not configured
          </p>
          <p className="mt-2 text-[13px] text-amber-800 dark:text-amber-200">
            Nothing was requested from Meta. To switch this on:
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-amber-800 dark:text-amber-200">
            {(result && !result.ok && result.missing ? result.missing : []).map((m) => (
              <li key={m}>• Set the <code className="font-mono">{m}</code> secret</li>
            ))}
            <li>• An Instagram Business or Creator account linked to a Facebook Page</li>
            <li>• App Review for <code className="font-mono">instagram_basic</code>,{' '}
              <code className="font-mono">instagram_manage_insights</code> and{' '}
              <code className="font-mono">pages_read_engagement</code></li>
          </ul>
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
            App Review is the long part — expect weeks, not hours.
          </p>
        </div>
      )}

      {result && !result.ok && !notConfigured && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-4">
          <p className="text-sm text-rose-900 dark:text-rose-100">{result.reason}</p>
        </div>
      )}

      {result?.ok && (
        <>
          {result.duplicate && (
            <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                <strong>{result.duplicate.name}</strong> is already on NowOpen with this handle
                ({result.duplicate.claimStatus}).
              </p>
              {/* A hint, not a refusal — the operator decides. */}
              <a href={`/businesses/${result.duplicate.id}`} target="_blank" rel="noopener noreferrer"
                 className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-900 dark:text-amber-100 underline">
                View the existing listing <ExternalLink size={11} />
              </a>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  {result.profile.name ?? `@${result.handle}`}
                </h3>
                <a href={result.url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400">
                  @{result.handle} <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-[11px] text-gray-400">
                Read {new Date(result.profile.retrievedAt).toLocaleString()}
              </p>
            </div>

            {result.profile.biography && (
              <p className="mt-3 text-[13px] text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2">
                {result.profile.biography}
              </p>
            )}

            {/*
              * Activity, shown separately from the facts below and never
              * offered as evidence. A follower count describes the account,
              * not the business.
              */}
            <p className="mt-3 text-[11px] text-gray-500">
              {result.profile.followersCount?.toLocaleString() ?? '—'} followers ·{' '}
              {result.profile.mediaCount?.toLocaleString() ?? '—'} posts
              <span className="block mt-1">
                Activity signals. Not recorded as facts about the business.
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              What this profile asserts, and how strongly
            </h3>
            {result.evidence.length === 0 ? (
              <p className="text-[13px] text-gray-500">
                Nothing extractable — the profile carries no name, website or description.
              </p>
            ) : (
              <ul className="space-y-2">
                {result.evidence.map((e) => (
                  <li key={e.field} className="flex items-start justify-between gap-3 text-[13px] border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-gray-500 text-[11px]">{FIELD_LABEL[e.field] ?? e.field}</p>
                      <p className="text-gray-900 dark:text-white break-words">{e.value}</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-gray-600 dark:text-gray-300">
                      {e.confidence}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info size={12} className="mt-0.5 shrink-0" />
              {/*
                * The profile picture is Meta Platform Data: the URL expires and
                * radar_sources records image_reuse_allowed = 'prohibited' for
                * this source. Saying so here stops somebody asking why it is
                * shown but not saved.
                */}
              The profile photograph is shown for checking only. It is not copied onto a listing —
              Meta&rsquo;s terms do not permit it and the link expires.
            </p>
          </div>

          {/*
            * What the account actually posts.
            *
            * Shown as the business's own words and a link to each post, which
            * is what Meta's media edge returns and all it permits us to keep.
            * An operator judging whether a listing is worth creating needs to
            * see that an account is alive and what it sells — that judgement
            * is the point of a manual extractor.
            */}
          {(result.profile.media?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                Recent posts
              </h3>
              <p className="text-[11px] text-gray-500 mb-3">
                {result.profile.media!.length} most recent, read through Meta&rsquo;s official API.
                Captions are the account&rsquo;s own words.
              </p>
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {result.profile.media!.map((m) => (
                  <li key={m.id} className="text-[12px] border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-gray-700 dark:text-gray-300 break-words min-w-0">
                        {m.caption ? m.caption.slice(0, 220) : <span className="text-gray-400">No caption</span>}
                        {m.caption && m.caption.length > 220 ? '…' : ''}
                      </p>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                        {/* A reel reports as VIDEO; say what Meta said. */}
                        {m.mediaType === 'VIDEO' ? 'Video / Reel' : m.mediaType ?? ''}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
                      {m.timestamp && <span>{new Date(m.timestamp).toLocaleDateString()}</span>}
                      {typeof m.likeCount === 'number' && <span>{m.likeCount.toLocaleString()} likes</span>}
                      {typeof m.commentsCount === 'number' && <span>{m.commentsCount.toLocaleString()} comments</span>}
                      {m.permalink && (
                        <a href={m.permalink} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          Open <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            * Filing it: the same destination as the website extractor —
            * radar_candidates, then the Review queue, then a human approval
            * that creates the listing. No shortcut to `businesses`.
            *
            * ── WHY ITS OWN CARD ──────────────────────────────────────────
            *
            * This first sat at the foot of the evidence card, beneath a list
            * that runs as long as the profile is rich, and an operator
            * reported there was no button at all. It was rendering; it was
            * unfindable — which, for the only action on the screen, is the
            * same failure. The primary action gets its own surface.
            */}
          <div className="rounded-2xl border-2 border-nowopen-500/30 bg-nowopen-50/50 dark:bg-nowopen-900/10 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
              File this business
            </h3>

            {/*
              * ── EVERYTHING BELOW STARTS UNTICKED ─────────────────────────
              *
              * These are things the account's own captions say, found by
              * literal matching — no model, no inference, no completing a
              * thought. A caption reading "we went to a wedding" yields
              * nothing, and that is correct.
              *
              * Publishing a service a business does not offer, onto a listing
              * that business has not claimed, is the harm this tool exists to
              * avoid. The reader proposes; a person decides.
              */}
            {findings && (findings.offerings.length > 0 || findings.phones.length > 0
              || findings.emails.length > 0 || findings.whatsapp.length > 0) ? (
              <div className="mb-4 space-y-3">
                {findings.offerings.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Services this account lists in its own captions
                    </p>
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      Click once for a service, twice for a product, again to clear. Only what the
                      business genuinely offers — names only, no prices are carried.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {findings.offerings.map((o) => (
                        <OfferChip
                          key={o}
                          label={o}
                          state={pickedOfferings.has(o) ? 'service' : pickedProducts.has(o) ? 'product' : 'off'}
                          onCycle={() => {
                            /*
                             * One control, three states: off -> service ->
                             * product -> off. A second pair of checkboxes per
                             * item would double the clicks for a list that is
                             * mostly ignored, and an operator picking through
                             * twelve captions is already doing enough.
                             */
                            const isService = pickedOfferings.has(o);
                            const isProduct = pickedProducts.has(o);
                            setPickedOfferings((prev) => {
                              const next = new Set(prev);
                              if (isService) next.delete(o); else if (!isProduct) next.add(o);
                              return next;
                            });
                            setPickedProducts((prev) => {
                              const next = new Set(prev);
                              if (isProduct) next.delete(o); else if (isService) next.add(o);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {(findings.phones.length > 0 || findings.emails.length > 0
                  || findings.whatsapp.length > 0) && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Contact details found in captions
                    </p>
                    <p className="text-[11px] text-gray-500 mb-1.5">
                      {/* A caption can also carry a customer's number or a partner's. */}
                      Choose the ones that belong to this business.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {findings.phones.map((v) => (
                        <Chip key={v} label={v} on={pickedPhone === v}
                          onClick={() => setPickedPhone(pickedPhone === v ? null : v)} />
                      ))}
                      {findings.emails.map((v) => (
                        <Chip key={v} label={v} on={pickedEmail === v}
                          onClick={() => setPickedEmail(pickedEmail === v ? null : v)} />
                      ))}
                      {findings.whatsapp.map((v) => (
                        <Chip key={v} label="WhatsApp link" on={pickedWhatsapp === v}
                          onClick={() => setPickedWhatsapp(pickedWhatsapp === v ? null : v)} />
                      ))}
                    </div>
                  </div>
                )}

                {findings.mentionsPrices && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    {/*
                      * Flagged, never carried: a caption's price is true the
                      * week it was posted and misleading afterwards.
                      */}
                    These captions quote prices. None are carried — ask the owner before publishing any.
                  </p>
                )}
              </div>
            ) : null}

            {/*
              * The logo is its own decision.
              *
              * A profile picture is the business's mark, and carrying it
              * asserts a right that copying its wording does not —
              * radar_sources records image_reuse_allowed = 'prohibited' for
              * this source. So: unticked, on its own, with the claim stated.
              */}
            {result.profile.profilePictureUrl && (
              <label className="flex items-start gap-2.5 cursor-pointer mb-2.5">
                <input
                  type="checkbox"
                  checked={carryLogo}
                  onChange={(e) => setCarryLogo(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300"
                />
                <span className="text-[12px] text-gray-600 dark:text-gray-400 flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <img
                      src={result.profile.profilePictureUrl}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                      referrerPolicy="no-referrer"
                    />
                    Use this profile picture as the listing logo
                    {logoBusy && <Loader2 size={12} className="animate-spin" />}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {/*
                      * Both halves said plainly: what we are claiming, and why
                      * it is copied rather than linked.
                      */}
                    A profile picture is the business&rsquo;s own mark — tick this only where using it on
                    their listing is defensible. The image is copied into NowOpen storage, because
                    Meta&rsquo;s address expires within days and a link would become a broken logo.
                  </span>
                </span>
              </label>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer mb-2.5">
              <input
                type="checkbox"
                checked={carryPosts}
                onChange={(e) => setCarryPosts(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300"
              />
              <span className="text-[12px] text-gray-600 dark:text-gray-400">
                Record links to the {result.profile.media?.length ?? 0} most recent posts.
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {/*
                    * Said on screen because "why are there no pictures?" is
                    * the first question an operator asks of this source.
                    */}
                  Links, not images. Instagram&rsquo;s photo addresses expire within days and
                  Meta&rsquo;s terms do not permit re-hosting them, so a copied gallery would
                  break — and the photographs are not ours to republish.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={authoredConfirmed}
                onChange={(e) => setAuthoredConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300"
              />
              <span className="text-[12px] text-gray-600 dark:text-gray-400">
                Carry the account&rsquo;s own description onto the listing.
                {/*
                  * Stated plainly because the two halves are treated
                  * differently: the account address and its activity are
                  * facts, the biography is the owner's writing.
                  */}
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  Leave this unticked to file the facts only — the name, website and
                  Instagram address. The description is still shown above either way.
                </span>
              </span>
            </label>

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => void addToQueue()}
                disabled={importing}
                className="inline-flex items-center gap-2 rounded-xl bg-nowopen-500 px-5 py-3 text-sm font-bold text-white hover:bg-nowopen-600 disabled:opacity-50 min-h-[44px]"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Inbox size={16} />}
                {staged ? 'Update in the review queue' : 'Add to the review queue'}
              </button>
              <p className="text-[11px] text-gray-500 max-w-xs">
                {/* Never "added to the directory": approval is a separate human act. */}
                Filed for review — approving it there is what creates the listing.
              </p>
            </div>

            {staged && (
              <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
                @{result.handle} is already on file ({staged.status}). Reading it again updates
                that candidate rather than filing a second one.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
