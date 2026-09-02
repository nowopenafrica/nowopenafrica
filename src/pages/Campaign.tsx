import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, Compass, Store, Check, Loader2, Share2, Copy, MessageCircle, MapPin,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { track } from '../lib/telemetry';
import { businessHref, DISCOVER_SELECT, openNow, type DiscoverBusiness } from '../lib/discover';
import { publicOpenState } from '../lib/openingHours';
import {
  CAMPAIGN_SLUG, CAMPAIGN_PATH, progress, progressLabel, showCounter, phaseOf, canJoin,
  normalizeReferralCode, referralLink, inviteMessage, shareTargets, circleLabel, nextMilestone,
  PILLARS, BUSINESS_JOURNEY, TIMELINE, type CampaignStats, type Circle,
} from '../lib/campaign';

/**
 * /campaign/founding-1000 — the launch campaign.
 *
 * A campaign layer over the product, not a microsite. Every call to action
 * routes into a flow that already exists: signup, the business dashboard, the
 * claim form on a real profile. Nothing here re-implements authentication or
 * onboarding, and nothing here shows a number that was not counted.
 *
 * The counter is the part most likely to be faked, so it is worth being plain
 * about: it reads campaign_stats(), which counts rows. Today that is 11 people
 * and 32 businesses against targets of 1,000 and 300. While the numbers are
 * that small the bar is hidden and the copy says "you're early" — which is both
 * true and a better argument than a fabricated crowd.
 */

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://nowopenafrica.com';

/** Where a referral code is parked until the visitor has an account to attach it to. */
const REF_KEY = 'noa.campaign.ref';

export default function Campaign() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [openBusinesses, setOpenBusinesses] = useState<DiscoverBusiness[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);

  /* ------------------------------------------------------------------ SEO */
  useEffect(() => applySeo({
    title: 'NowOpen Africa — Africa Is Now Open | Founding 1,000',
    description:
      "Join the Founding 1,000 of NowOpen Africa. Discover businesses, find what's open, "
      + 'keep your favourites and help businesses across Africa get discovered.',
    path: CAMPAIGN_PATH,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Africa Is Now Open — The Founding 1,000',
      url: `${ORIGIN}${CAMPAIGN_PATH}`,
      isPartOf: { '@type': 'WebSite', name: 'NowOpen Africa', url: ORIGIN },
    },
  }), []);

  /* ------------------------------------------- park an incoming referral */
  /*
   * A code arrives on the URL before there is an account to attach it to, so it
   * is held locally and claimed the moment somebody signs in. The claim itself
   * is server-side — claim_referral() checks the code exists, is not the
   * claimant's own, and that the account is new enough to be attributable.
   */
  useEffect(() => {
    const incoming = normalizeReferralCode(params.get('ref'));
    if (incoming) {
      try { localStorage.setItem(REF_KEY, incoming); } catch { /* private mode */ }
    }
  }, [params]);

  useEffect(() => {
    if (!user) return;
    let parked: string | null = null;
    try { parked = localStorage.getItem(REF_KEY); } catch { /* private mode */ }
    if (!parked) return;
    (async () => {
      const { data } = await supabase.rpc('claim_referral', { p_code: parked, p_campaign: CAMPAIGN_SLUG });
      // Clear either way: a rejected code should not be retried on every visit.
      try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
      if (data === 'joined') track('campaign_referral_joined', { campaign: CAMPAIGN_SLUG });
    })().catch(() => { /* attribution is best-effort; never block the page */ });
  }, [user]);

  /* --------------------------------------------------------------- data */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, biz] = await Promise.all([
        supabase.rpc('campaign_stats', { p_campaign: CAMPAIGN_SLUG }),
        supabase.from('businesses').select(DISCOVER_SELECT)
          .eq('is_listable', true)
          .order('listing_score', { ascending: false })
          .limit(60),
      ]);
      if (cancelled) return;
      setStats((s.data as CampaignStats) ?? null);
      const rows = (biz.data as unknown as DiscoverBusiness[]) ?? [];
      // Real businesses, actually open. Never a placeholder card.
      setOpenBusinesses(openNow(rows, new Date()).slice(0, 6));
      setLoading(false);
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { track('campaign_view', { campaign: CAMPAIGN_SLUG }); }, []);

  /* ------------------------------------------------------- own referral */
  const loadCircle = useCallback(async () => {
    if (!user) return;
    const [c, circ] = await Promise.all([
      supabase.rpc('my_referral_code'),
      supabase.rpc('my_founding_circle', { p_campaign: CAMPAIGN_SLUG }),
    ]);
    if (typeof c.data === 'string') setCode(c.data);
    if (circ.data) setCircle(circ.data as Circle);
  }, [user]);

  useEffect(() => { void loadCircle().catch(() => { /* optional block */ }); }, [loadCircle]);

  const phase = phaseOf(stats);
  const joinable = canJoin(phase);
  const counterVisible = showCounter(stats);
  const people = progress(stats?.users ?? 0, stats?.target_users ?? 1000);
  const shops = progress(stats?.businesses ?? 0, stats?.target_businesses ?? 300);

  const link = code ? referralLink(code, ORIGIN) : `${ORIGIN}${CAMPAIGN_PATH}`;
  const bizMessage = useMemo(() => inviteMessage(link, 'business'), [link]);
  const targets = useMemo(() => shareTargets(link, bizMessage), [link, bizMessage]);

  const cta = (label: string, kind: 'explorer' | 'business') => () =>
    track('campaign_cta_click', { campaign: CAMPAIGN_SLUG, cta: label, path: kind });

  const share = async (t: (typeof targets)[number]) => {
    track('campaign_share', { campaign: CAMPAIGN_SLUG, target: t.key });
    if (t.key === 'copy') {
      try { await navigator.clipboard.writeText(link); toast.success('Link copied'); }
      catch { toast.error('Could not copy — select the link and copy it manually.'); }
      return;
    }
    if (t.href) window.open(t.href, '_blank', 'noopener,noreferrer');
  };

  const nativeShare = async () => {
    track('campaign_share', { campaign: CAMPAIGN_SLUG, target: 'native' });
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (!nav.share) { void share(targets[1]); return; }
    try { await nav.share({ title: 'NowOpen Africa', text: bizMessage, url: link }); }
    catch { /* the sheet was dismissed; not an error */ }
  };

  /* ------------------------------------------------------------ styling */
  const shell = 'site-container';
  const eyebrow = 'text-[11px] font-mono uppercase tracking-[0.18em] text-amber-500';
  const btnPrimary = 'inline-flex items-center justify-center gap-2 px-6 min-h-[52px] rounded-full bg-white text-gray-950 text-[15px] font-bold hover:bg-amber-50 transition';
  const btnGhost = 'inline-flex items-center justify-center gap-2 px-6 min-h-[52px] rounded-full border border-white/25 text-white text-[15px] font-semibold hover:border-white/60 transition';

  return (
    <main className="bg-gray-950 text-white">
      {/* ============================================================ HERO */}
      <section className="relative overflow-hidden">
        {/* One restrained gradient wash. Motion is limited to a fade so the
            page is readable the instant it paints, and reduced-motion users
            see no movement at all. */}
        <div aria-hidden="true" className="absolute inset-0 opacity-70"
             style={{ background: 'radial-gradient(120% 80% at 15% 0%, #1e1b4b 0%, #0a0a0f 55%, #0a0a0f 100%)' }} />
        <div className={`${shell} relative py-20 sm:py-28`}>
          <p className={eyebrow}>The Founding 1,000 · NowOpen Africa</p>
          <h1 className="mt-4 font-extrabold tracking-tight leading-[0.92] text-[clamp(2.6rem,9vw,5.6rem)] motion-safe:animate-fadeIn">
            AFRICA IS<br /><span className="text-amber-400">NOW OPEN.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-[17px] sm:text-lg text-white/70 leading-relaxed">
            {stats?.hero_subcopy
              ?? "We're building the new way people discover businesses across Africa — and the new way businesses get discovered, connected and remembered."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            {joinable ? (
              <>
                <Link to="/register" onClick={cta('join-as-explorer', 'explorer')} className={btnPrimary}>
                  <Compass size={18} /> Join as an Explorer
                </Link>
                <Link to="/register" onClick={cta('put-my-business-on', 'business')} className={btnGhost}>
                  <Store size={18} /> Put my business on NowOpen
                </Link>
              </>
            ) : (
              <Link to="/discover" className={btnPrimary}>Explore NowOpen <ArrowRight size={18} /></Link>
            )}
          </div>
          <p className="mt-5 text-[13px] text-white/45">
            {phase === 'closed'
              ? 'The Founding 1,000 campaign has closed.'
              : phase === 'preparing'
                ? "Founding 1,000 is opening — you're early."
                : 'Be part of the Founding 1,000.'}
          </p>
        </div>
      </section>

      {/* ========================================================= COUNTER */}
      {/* Shown only when the numbers are real and worth showing. See
          showCounter() — a bar pinned at 1% argues against joining. */}
      {counterVisible && (
        <section className={`${shell} pb-16`} aria-label="Campaign progress">
          <div className="grid gap-4 sm:grid-cols-2">
            {([['Explorers', people, 'explorers'], ['Founding businesses', shops, 'business']] as const).map(
              ([label, p, noun]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-3xl font-extrabold tabular-nums">{p.count.toLocaleString()}</span>
                    <span className="text-[13px] text-white/50">of {p.target.toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-white/70">{label}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400 motion-safe:transition-all"
                         style={{ width: `${Math.max(p.percent, p.count > 0 ? 1 : 0)}%` }}
                         role="progressbar" aria-valuenow={p.count} aria-valuemin={0} aria-valuemax={p.target}
                         aria-label={label} />
                  </div>
                  <p className="mt-2 text-[12px] text-white/45">{progressLabel(p, noun)}</p>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* ==================================================== TWO ENTRANCES */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How do you want to enter?</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {([
              {
                icon: Compass, title: "I'm here to discover", cta: 'Become a Founding Explorer',
                kind: 'explorer' as const, to: '/register',
                copy: 'Find businesses. See what is open. Discover offers. Keep the places you love.',
                points: ['Discover businesses near you', 'See what is Open Now', 'Keep your favourites',
                         'Find offers worth acting on', 'Stay connected to businesses you like'],
              },
              {
                icon: Store, title: 'I run a business', cta: 'Become a Founding Business',
                kind: 'business' as const, to: '/register',
                copy: 'Put your business where customers are already looking.',
                points: ['Get discovered', 'Claim your business profile', 'Show when you are Open Now',
                         'Publish offers', 'Connect with customers', 'Unlock NowOpen Studio'],
              },
            ]).map((c) => (
              <article key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex flex-col">
                <c.icon size={22} className="text-amber-400" />
                <h3 className="mt-4 text-xl font-bold">{c.title}</h3>
                <p className="mt-1.5 text-[15px] text-white/60">{c.copy}</p>
                <ul className="mt-5 space-y-2 flex-1">
                  {c.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[14px] text-white/75">
                      <Check size={15} className="mt-0.5 shrink-0 text-amber-400" /> {p}
                    </li>
                  ))}
                </ul>
                {joinable && (
                  <Link to={c.to} onClick={cta(c.cta, c.kind)}
                        className="mt-6 inline-flex items-center justify-center gap-2 px-5 min-h-[48px] rounded-full bg-white text-gray-950 font-bold hover:bg-amber-50 transition">
                    {c.cta} <ArrowRight size={16} />
                  </Link>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================= WHY */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Not another business directory.</h2>
          <p className="mt-3 max-w-2xl text-[16px] text-white/60">
            NowOpen Africa is being built as the operating system for business growth in Africa.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PILLARS.map((p, i) => (
              <Link key={p.key} to={p.href}
                    className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 hover:border-amber-400/50 transition">
                <span className="font-mono text-[11px] text-white/30">0{i + 1}</span>
                <h3 className="mt-2 text-[15px] font-bold group-hover:text-amber-400 transition">{p.title}</h3>
                <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">{p.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================== WHAT'S OPEN NOW */}
      {/* Real businesses, actually open at this moment. If none are, the
          section says so rather than filling with placeholders. */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">What is open right now?</h2>
              <p className="mt-2 text-[15px] text-white/55">Live from NowOpen, this minute.</p>
            </div>
            <Link to="/open-now" className="text-[14px] font-semibold text-amber-400 hover:underline">
              See everything open →
            </Link>
          </div>

          {loading ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-xl border border-white/10 bg-white/[0.04] motion-safe:animate-pulse" />
              ))}
            </div>
          ) : openBusinesses.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-8 text-center">
              <p className="text-[15px] text-white/70">Nothing is confirmed open at this moment.</p>
              <p className="mt-1 text-[13px] text-white/45">
                Most businesses have not published their hours yet — which is exactly what the
                Founding 1,000 is for.
              </p>
              <Link to="/discover" className="inline-block mt-4 text-[14px] font-semibold text-amber-400 hover:underline">
                Browse businesses instead →
              </Link>
            </div>
          ) : (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {openBusinesses.map((b) => {
                const state = publicOpenState(b, new Date());
                return (
                  <li key={b.id}>
                    <Link to={businessHref(b)}
                          className="block h-full rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-amber-400/50 transition">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-bold leading-snug">{b.name}</span>
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          {state.kind === 'closing-soon' ? 'CLOSING SOON' : 'OPEN NOW'}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-white/50">
                        {[b.category, b.location].filter(Boolean).join(' · ')}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ================================================ BUSINESS JOURNEY */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Your business deserves to be found.</h2>
          <p className="mt-3 max-w-2xl text-[16px] text-white/60">
            Your customers are already searching. Make sure they find you.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BUSINESS_JOURNEY.map((s, i) => (
              <li key={s.step} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <span className="font-mono text-[11px] text-amber-400">STEP {i + 1}</span>
                <h3 className="mt-1.5 text-[15px] font-bold">{s.step}</h3>
                <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
          {joinable && (
            <Link to="/register" onClick={cta('claim-add-my-business', 'business')}
                  className="mt-8 inline-flex items-center gap-2 px-6 min-h-[52px] rounded-full bg-amber-400 text-gray-950 font-bold hover:bg-amber-300 transition">
              Claim or add my business <ArrowRight size={17} />
            </Link>
          )}
        </div>
      </section>

      {/* ================================================ REFERRAL / CIRCLE */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Know a business that should be here?</h2>
          <p className="mt-3 max-w-2xl text-[16px] text-white/60">
            The fastest way NowOpen grows is somebody sending it to a business they already use.
          </p>

          {user ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className={eyebrow}>Your Founding Circle</p>
              <div className="mt-3 flex flex-wrap items-end gap-6">
                <span><span className="text-3xl font-extrabold tabular-nums">{circle?.invited ?? 0}</span>
                  <span className="ml-2 text-[13px] text-white/50">invited</span></span>
                <span><span className="text-3xl font-extrabold tabular-nums text-amber-400">{circle?.activated ?? 0}</span>
                  <span className="ml-2 text-[13px] text-white/50">started using NowOpen</span></span>
                {nextMilestone(circle?.activated ?? 0) !== null && (
                  <span className="text-[13px] text-white/40">
                    next milestone: {nextMilestone(circle?.activated ?? 0)}
                  </span>
                )}
              </div>
              {/* Says why an invite has not counted yet — otherwise a working
                  system looks broken to the person who shared it. */}
              <p className="mt-2 text-[13px] text-white/55">{circleLabel(circle ?? { invited: 0, activated: 0 })}</p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-black/40 px-3 py-2 text-[12px] text-white/70 break-all max-w-full">
                  {code ? link : <Loader2 size={13} className="animate-spin inline" />}
                </code>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={nativeShare}
                        className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-full bg-white text-gray-950 text-[14px] font-bold">
                  <Share2 size={15} /> Share
                </button>
                {targets.map((t) => (
                  <button key={t.key} onClick={() => void share(t)}
                          className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-full border border-white/20 text-[14px] font-semibold hover:border-white/50 transition">
                    {t.key === 'whatsapp' && <MessageCircle size={15} className="text-emerald-400" />}
                    {t.key === 'copy' && <Copy size={15} />}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-[15px] text-white/70">
                Sign in and you get your own invite link, plus a Founding Circle showing who joined
                because of you.
              </p>
              <Link to="/register" onClick={cta('referral-signin', 'explorer')}
                    className="mt-4 inline-flex items-center gap-2 px-5 min-h-[48px] rounded-full bg-white text-gray-950 font-bold">
                Get my invite link <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ======================================================== TIMELINE */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className={shell}>
          <p className={eyebrow}>30 days</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">The plan.</h2>
          {/* Phases, deliberately not achievements — none of these is claimed
              as done, because none of it is. */}
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIMELINE.map((t) => (
              <li key={t.week} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <span className="font-mono text-[11px] text-amber-400">{t.week}</span>
                <h3 className="mt-1.5 text-[15px] font-bold uppercase tracking-wide">{t.title}</h3>
                <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed">{t.goal}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* =========================================================== CITIES */}
      {(stats?.cities ?? 0) > 0 && (
        <section className="border-t border-white/10 py-16 sm:py-20">
          <div className={shell}>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Where should we open next?</h2>
            <p className="mt-3 text-[15px] text-white/55">
              {stats?.cities} {stats?.cities === 1 ? 'city' : 'cities'} and {stats?.categories} categories
              on NowOpen so far.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Benin City', 'Kano', 'Enugu', 'Abeokuta'].map((city) => (
                <Link key={city} to={`/businesses/in/${city.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => track('campaign_cta_click', { campaign: CAMPAIGN_SLUG, cta: 'city', city })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-[14px] font-semibold hover:border-amber-400/60 hover:text-amber-400 transition">
                  <MapPin size={14} /> {city}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ======================================================= FINAL CTA */}
      <section className="border-t border-white/10 py-20 sm:py-28">
        <div className={shell}>
          <h2 className="font-extrabold tracking-tight leading-[0.95] text-[clamp(2.2rem,7vw,4.5rem)]">
            AFRICA IS <span className="text-amber-400">NOW OPEN.</span>
          </h2>
          <p className="mt-5 max-w-xl text-[17px] text-white/60 leading-relaxed">
            The businesses are here. The people are here. The opportunity is here.
          </p>
          {joinable && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" onClick={cta('final-explorer', 'explorer')} className={btnPrimary}>
                Join as an Explorer
              </Link>
              <Link to="/register" onClick={cta('final-business', 'business')} className={btnGhost}>
                Add my business
              </Link>
            </div>
          )}
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-white/30">
            Founding 1,000 · NowOpen Africa
          </p>
        </div>
      </section>

      {/* ================================================= STICKY MOBILE CTA */}
      {joinable && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-gray-950/95 backdrop-blur px-3 py-2.5"
             style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2">
            <Link to="/register" onClick={cta('sticky-join', 'explorer')}
                  className="flex-1 inline-flex items-center justify-center min-h-[48px] rounded-full bg-white text-gray-950 font-bold text-[15px]">
              Join now
            </Link>
            <Link to="/register" onClick={cta('sticky-business', 'business')}
                  className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-full border border-white/25 font-semibold text-[14px]">
              For businesses
            </Link>
          </div>
        </div>
      )}
      {/* Clears the sticky bar so the last line is never hidden behind it. */}
      {joinable && <div aria-hidden="true" className="lg:hidden h-20" />}
    </main>
  );
}
