import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  X, Sparkles, Store, Wrench, Package, Images, Megaphone, Tag,
  MessageSquare, Radio, MapPin, Calendar, Video, ChevronDown, Lock, Clock, BadgeCheck,
  ReceiptText, FileText, CreditCard, Palette, FileSpreadsheet, BookOpen, Rocket,
  Sparkle, CalendarRange, Users, BarChart3, Heart, Settings2, Check,
} from 'lucide-react';

import {
  CREATE_ACTIONS, actionsByProminence, permissionFor, permissionMessage,
  type CreateAction, type CreateIntent,
} from '../../lib/universalCreate/intents';
import { rememberIntent } from '../../lib/universalCreate/pendingIntent';
import { fetchClaimableForMe, claimPromptFor, type ClaimableMatch } from '../../lib/universalCreate/claimable';
import CreateReelFlow from './CreateReelFlow';
import { CREATE_TOOLS, type CreateTool } from '../../lib/universalCreate/intents';
import { fetchPinnedTools, savePinnedTools } from '../../lib/universalCreate/pins';
import { track } from '../../lib/telemetry';

/**
 * The Universal Create hub — "What do you want to open?"
 *
 * Distinct from "NowOpen Create", the design/print marketplace on /media.
 *
 * ── WHY THE QUESTION IS "OPEN" AND NOT "CREATE" ──────────────────────────
 *
 * Creating is what the software does. Opening is what the person is doing:
 * making something discoverable, bookable, visible. The brand is the sentence,
 * so the sheet asks the brand's question.
 *
 * ── WHY THERE IS NO ANIMATION LIBRARY HERE ───────────────────────────────
 *
 * framer-motion is not installed, and this sits on the homepage — the page
 * whose speed matters most. Adding ~40KB of animation runtime so a sheet can
 * spring would be paid for by every visitor who never opens it. CSS
 * transitions with a spring-ish cubic-bezier do the same job for nothing, and
 * respect prefers-reduced-motion for free via the media query below.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 *
 * Offer a tile that goes nowhere. Actions with no workflow behind them render
 * as "coming", explain why, and refuse to navigate. See intents.ts.
 */

const ICONS: Record<string, typeof Store> = {
  Sparkles, Store, Wrench, Package, Images, Megaphone, Tag, MessageSquare, Radio, MapPin, Calendar, Video,
  ReceiptText, FileText, CreditCard, Palette, FileSpreadsheet, BookOpen, Rocket,
  Sparkle, CalendarRange, Users, BarChart3, Heart,
};

interface Props {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  hasBusiness: boolean;
}

export default function CreateHub({ open, onClose, signedIn, hasBusiness }: Props) {
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const [blocked, setBlocked] = useState<{ type: string; message: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  /*
   * Where focus came from, so it can be given back. Returning focus to the
   * page body after a dialog closes loses a keyboard user their place
   * entirely — they land at the top and have to tab back down.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /*
   * ── RADAR → CREATE ─────────────────────────────────────────────────────
   *
   * Listings already on NowOpen that carry this person's CONFIRMED email or
   * phone. MEASURED 2026-10-06: 3,208 of 3,210 listings have no owner, so the
   * likeliest outcome of somebody opening this hub is a duplicate of a
   * business that is already here.
   *
   * Loaded only when the sheet opens — it is a lookup for a question nobody
   * has asked yet on every other page.
   */
  const [claimable, setClaimable] = useState<ClaimableMatch[]>([]);
  /** An action that runs here rather than at another URL — see opensInPlace. */
  const [inPlace, setInPlace] = useState<CreateAction | null>(null);
  /*
   * The tools strip. `null` until the read returns, so the menu does not flash
   * the defaults and then rearrange itself under somebody's finger.
   */
  const [tools, setTools] = useState<CreateTool[] | null>(null);
  const [editingTools, setEditingTools] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus the panel, not the first tile: a screen reader should hear the
    // question before it hears the options.
    const t = window.setTimeout(() => closeRef.current?.focus(), 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;

      // Trap focus. Without this, Tab walks out of the sheet and into the page
      // behind it, which is still visible but not operable.
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    // The page behind must not scroll under the sheet.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  // Reset the transient state each time it opens, so a refusal from last time
  // is not still on screen.
  useEffect(() => {
    if (!open) return;
    setBlocked(null);
    setShowMore(false);

    let alive = true;
    // Signed-out callers get an empty list from the database itself, so there
    // is no need to check here — and no way to ask on somebody else's behalf.
    if (signedIn) {
      fetchClaimableForMe().then((m) => { if (alive) setClaimable(m); });
      fetchPinnedTools().then((t) => { if (alive) setTools(t); });
    } else {
      setClaimable([]);
      // Tools are owner workbenches; there is nothing to show a visitor.
      setTools([]);
    }
    return () => { alive = false; };
  }, [open, signedIn]);

  if (!open && !inPlace) return null;

  const choose = (action: CreateAction) => {
    const permission = permissionFor(action, { signedIn, hasBusiness });
    const message = permissionMessage(permission, action);

    track('create_action_selected', { type: action.type, permission });

    if (permission === 'not_built' || permission === 'needs_business') {
      // Explained in place rather than navigating somewhere unhelpful.
      setBlocked({ type: action.type, message: message ?? '' });
      return;
    }

    const intent: CreateIntent = { type: action.type, source: 'universal_create' };

    if (permission === 'needs_auth') {
      /*
       * Remember, then send them to sign in. They come back here rather than
       * to a generic dashboard — the brief's rule, and the difference between
       * an interruption and a dead end.
       */
      rememberIntent(intent, action.destination ?? '/dashboard');
      track('create_auth_required', { type: action.type });
      onClose();
      navigate('/login');
      return;
    }

    track('creation_started', { type: action.type, source: 'universal_create' });

    if (action.opensInPlace) {
      /*
       * Stay here and run it. The sheet closes so the camera is not competing
       * with a dialog behind it, but no navigation happens — going to a URL
       * and back would lose the recording if anything reloaded.
       */
      setInPlace(action);
      return;
    }

    onClose();
    navigate(action.destination!);
  };

  const primary = actionsByProminence('primary');
  const secondary = actionsByProminence('secondary');
  const more = actionsByProminence('more');

  /*
   * An in-place action takes over completely. Rendered instead of the sheet
   * rather than on top of it: two stacked modals means two focus traps and two
   * Escape handlers fighting each other.
   */
  if (inPlace?.type === 'reel') {
    return <CreateReelFlow onDone={() => { setInPlace(null); onClose(); }} />;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-hub-title"
    >
      {/* The backdrop is a button so a pointer can dismiss; Escape covers the
          keyboard, and the tab order skips this via tabIndex -1. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-[createFade_180ms_ease-out]"
      />

      <div
        ref={panelRef}
        className="relative w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto
                   bg-white dark:bg-gray-900
                   rounded-t-3xl sm:rounded-3xl
                   border border-gray-200 dark:border-gray-700
                   shadow-2xl
                   animate-[createRise_260ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* A grab handle on mobile, where the sheet comes from the bottom. */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        </div>

        <div className="px-5 sm:px-8 pt-4 sm:pt-7 pb-2 flex items-start justify-between gap-4">
          <div>
            <h2 id="create-hub-title" className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
              What do you want<br className="sm:hidden" /> to open?
            </h2>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
              Make it discoverable across NowOpen Africa.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-10 h-10 min-w-[44px] min-h-[44px] -mr-1 flex items-center justify-center
                       rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white
                       hover:bg-gray-100 dark:hover:bg-gray-800
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X size={20} />
          </button>
        </div>

        {/*
          * Asked first, because it is the one thing here that saves somebody
          * from duplicating work. Phrased as a question: the match is one
          * shared contact detail, which is evidence and not proof, and
          * claiming still goes through review.
          */}
        {claimable.length > 0 && (
          <div className="mx-5 sm:mx-8 mb-3 rounded-2xl border border-emerald-300 dark:border-emerald-700
                          bg-emerald-50 dark:bg-emerald-900/20 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide
                          text-emerald-700 dark:text-emerald-300">
              <BadgeCheck size={13} /> Already on NowOpen
            </p>
            <ul className="mt-2 space-y-2">
              {claimable.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm text-emerald-900 dark:text-emerald-100 min-w-0">
                    {claimPromptFor(m)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      track('create_claim_prompt_followed', { matched_on: m.matchedOn });
                      onClose();
                      navigate(`/businesses/${m.id}`);
                    }}
                    className="shrink-0 inline-flex items-center px-3 min-h-[38px] rounded-lg
                               bg-emerald-700 dark:bg-emerald-400 text-white dark:text-emerald-950
                               text-[12px] font-bold
                               focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    Claim it
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-emerald-800/80 dark:text-emerald-200/70">
              Not yours? Carry on below — nothing is claimed until you ask and we check.
            </p>
          </div>
        )}

        {blocked && (
          <div className="mx-5 sm:mx-8 mb-2 rounded-xl border border-amber-300 dark:border-amber-700
                          bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
            <p className="text-sm text-amber-900 dark:text-amber-100">{blocked.message}</p>
          </div>
        )}

        <div className="px-5 sm:px-8 pb-7 space-y-5">
          <Group actions={primary} onChoose={choose} signedIn={signedIn} hasBusiness={hasBusiness} large />

          {secondary.length > 0 && (
            <Group actions={secondary} onChoose={choose} signedIn={signedIn} hasBusiness={hasBusiness} />
          )}

          {/*
            * ── YOUR TOOLS ──────────────────────────────────────────────────
            *
            * The things a business reaches for repeatedly — a receipt, an
            * invoice, a card. Separate from the actions above because they are
            * a different kind of thing: an action opens something new on your
            * profile, a tool is a workbench you come back to.
            *
            * Which ones matter is entirely down to the trade, so the list is
            * the person's own. Every tool is an existing Studio module.
            */}
          {signedIn && tools !== null && (
            <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3 pt-3 pb-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  Your tools
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDraftKeys(tools.map((t) => t.key));
                    setEditingTools((v) => !v);
                  }}
                  aria-expanded={editingTools}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold
                             text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                             min-h-[44px] px-1 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {editingTools ? <Check size={14} /> : <Settings2 size={14} />}
                  {editingTools ? 'Done' : 'Edit'}
                </button>
              </div>

              {editingTools ? (
                <>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-2">
                    Pick the tools you use most. They appear here next time, on every device.
                  </p>
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                    {CREATE_TOOLS.map((t) => {
                      const Icon = ICONS[t.icon] ?? Wrench;
                      const on = draftKeys.includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setDraftKeys((prev) =>
                            prev.includes(t.key) ? prev.filter((k) => k !== t.key)
                              // Capped at the same number the database enforces,
                              // so the UI cannot offer a save that will be refused.
                              : prev.length >= 12 ? prev : [...prev, t.key])}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 min-h-[44px]
                            text-left text-[12px] font-semibold transition-colors
                            focus:outline-none focus:ring-2 focus:ring-blue-500
                            ${on
                              ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}
                        >
                          <Icon size={15} className="shrink-0" />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await savePinnedTools(draftKeys);
                        if (!res.ok) { toast.error(res.message ?? 'Could not save your tools.'); return; }
                        // Re-read rather than trusting the draft: the saved
                        // order is what the next visit will show.
                        setTools(await fetchPinnedTools());
                        setEditingTools(false);
                        track('create_tools_customised', { count: draftKeys.length });
                      }}
                      className="inline-flex items-center px-4 min-h-[40px] rounded-lg
                                 bg-gray-900 dark:bg-white text-white dark:text-gray-900
                                 text-[12px] font-bold
                                 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Save tools
                    </button>
                    <span className="text-[11px] text-gray-500">{draftKeys.length} of 12</span>
                  </div>
                </>
              ) : tools.length === 0 ? (
                <p className="text-[12px] text-gray-500 dark:text-gray-400 pb-1">
                  No tools pinned. Press Edit to choose the ones you use.
                </p>
              ) : (
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                  {tools.map((t) => {
                    const Icon = ICONS[t.icon] ?? Wrench;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          track('creation_started', { type: t.key, source: 'universal_create' });
                          onClose();
                          navigate(t.destination);
                        }}
                        title={t.description}
                        className="flex items-center gap-2 rounded-xl border
                                   border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
                                   px-3 py-2.5 min-h-[44px] text-left
                                   text-[12px] font-semibold text-gray-900 dark:text-white
                                   transition-[transform,border-color] duration-200
                                   hover:border-gray-900 dark:hover:border-white
                                   motion-safe:hover:-translate-y-0.5
                                   focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {more.length > 0 && (
            <div>
              {/* Progressive disclosure: the hub must never open as a wall of
                  ten equal tiles. */}
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                className="inline-flex items-center gap-1.5 text-sm font-semibold
                           text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                           min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg px-1"
              >
                <ChevronDown size={16} className={showMore ? 'rotate-180 transition-transform' : 'transition-transform'} />
                {showMore ? 'Less' : 'More ways to open'}
              </button>
              {showMore && (
                <div className="mt-3">
                  <Group actions={more} onChoose={choose} signedIn={signedIn} hasBusiness={hasBusiness} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({
  actions, onChoose, signedIn, hasBusiness, large = false,
}: {
  actions: CreateAction[];
  onChoose: (a: CreateAction) => void;
  signedIn: boolean;
  hasBusiness: boolean;
  large?: boolean;
}) {
  return (
    <div className={large ? 'grid gap-2.5 sm:grid-cols-2' : 'grid gap-2.5 grid-cols-1 sm:grid-cols-3'}>
      {actions.map((a) => {
        const Icon = ICONS[a.icon] ?? Store;
        const permission = permissionFor(a, { signedIn, hasBusiness });
        const unavailable = permission === 'not_built';

        return (
          <button
            key={a.type}
            type="button"
            onClick={() => onChoose(a)}
            aria-disabled={unavailable}
            className={`group text-left rounded-2xl border p-4 min-h-[44px]
              transition-[transform,box-shadow,border-color] duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${unavailable
                ? 'border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 cursor-default'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-900 dark:hover:border-white hover:shadow-lg motion-safe:hover:-translate-y-0.5 active:translate-y-0'}`}
          >
            <span className="flex items-start gap-3">
              <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                ${unavailable
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                  : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'}`}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={`font-bold text-sm ${unavailable ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                    {a.label}
                  </span>
                  {/* States the reason on the tile, so nobody clicks to find out. */}
                  {unavailable && <Clock size={12} className="text-gray-400" aria-label="Coming soon" />}
                  {!unavailable && permission === 'needs_auth' && (
                    <Lock size={12} className="text-gray-400" aria-label="Sign in required" />
                  )}
                </span>
                <span className="block mt-0.5 text-[12px] leading-snug text-gray-500 dark:text-gray-400">
                  {unavailable ? a.comingNote : a.description}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { CREATE_ACTIONS };
