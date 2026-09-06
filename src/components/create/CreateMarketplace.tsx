import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Megaphone, Package, Printer, Sparkles, Video,
} from 'lucide-react';

import {
  CATALOGUE, PACKS, CREDIT_BUNDLES, awaitingQuote, byDivision, priceLabel, sellable,
  type CatalogueItem, type Division,
} from '../../lib/create/catalogue';

/**
 * NowOpen Create — the public marketplace on /media.
 *
 * Create it. Brand it. Print it. Promote it. Grow it.
 *
 * This is the PUBLIC page behind the "Create" nav item, not the signed-in
 * Studio. Somebody who has never heard of NowOpen has to be able to see what
 * can be made and what it costs before deciding to sign up — pricing is one of
 * the first things anybody looks for, and putting it behind a login is the
 * fastest way to lose the visit.
 *
 * WHAT IT IS NOT: a print shop. Printivo's model is the benchmark for the
 * catalogue and the fulfilment chain; the part NowOpen adds is that a finished
 * asset goes straight to print, to an advert, or onto a profile people already
 * search. That is the difference between "design and print" and "create and
 * grow", and it is why the Advertise division is on this page at all.
 *
 * ON THE PRICES: every printed item is an estimate derived from a competitor's
 * public retail price. No production partner has quoted them, so they can be
 * requested and not bought. See lib/create/catalogue.ts — the honesty is in the
 * data, and this component only renders what the data admits.
 */

const DIVISIONS: {
  key: Division; label: string; icon: typeof Printer; blurb: string;
}[] = [
  { key: 'create', label: 'Create', icon: Sparkles, blurb: 'Posts, flyers, posters, cards and menus — made from your brand, free.' },
  { key: 'video', label: 'Video', icon: Video, blurb: 'Reels, adverts and logo animations, sized for where you are posting.' },
  { key: 'brand', label: 'Brand', icon: Package, blurb: 'Logo, identity, guidelines and packaging by a NowOpen creator.' },
  { key: 'print', label: 'Print', icon: Printer, blurb: 'Cards, flyers, banners and branded items, produced and delivered.' },
];

/** The step after a design exists. This is what a print shop cannot offer. */
const ADVERTISE = [
  { label: 'Promote on NowOpen', to: '/adverts', blurb: 'Sponsored placement where people are already searching.' },
  { label: 'Billboards & LED', to: '/adverts', blurb: 'Real-world placements across 42 cities.' },
  { label: 'Share to WhatsApp', to: '/studio', blurb: 'The channel your customers actually open.' },
  { label: 'Publish an offer', to: '/offers', blurb: 'Put it in front of people looking for a reason to buy.' },
];

export default function CreateMarketplace() {
  const [division, setDivision] = useState<Division>('create');
  const items = useMemo(() => byDivision(division), [division]);
  const pending = useMemo(() => awaitingQuote().length, []);

  return (
    <div className="space-y-10">
      {/* No heading here. The page's own hero already says "Create it. Brand it.
          Print it. Promote it. Grow it." — repeating it immediately below was
          the same duplication this page had before. */}
      <section>
        <div className="flex flex-wrap gap-2">
          {DIVISIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setDivision(key)}
              className={`inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-full border text-sm font-semibold transition ${
                division === key
                  ? 'border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-pink-400'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {DIVISIONS.find((d) => d.key === division)?.blurb}
        </p>

        {division === 'print' && pending > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <strong>These are market estimates, not final prices.</strong> NowOpen is signing
              production partners now — request a quote and you will get a real price for your
              job, your quantity and your city.
            </p>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => <ItemCard key={item.sku} item={item} />)}
        </div>
      </section>

      {/* Advertise — the division that makes this different from a print shop. */}
      <section>
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-pink-600 dark:text-pink-400" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Then put it to work</h3>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          A flyer nobody sees is a cost. This is the part a print shop cannot do for you.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ADVERTISE.map((a) => (
            <Link key={a.label} to={a.to}
              className="group rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:-translate-y-0.5 hover:shadow-md transition">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-pink-700 dark:group-hover:text-pink-300">
                {a.label}
              </h4>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{a.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Business packs</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Everything a business needs at one stage, rather than buying it piece by piece.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((p) => (
            <div key={p.sku} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col">
              <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
              <div className="mt-0.5 text-lg font-extrabold text-gray-900 dark:text-white">
                ₦{p.price.toLocaleString('en-NG')}
              </div>
              {!sellable(p) && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Estimate — includes printing not yet quoted
                </p>
              )}
              <ul className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5 flex-1">
                {p.includes.slice(0, 6).map((line) => <li key={line}>· {line}</li>)}
                {p.includes.length > 6 && <li className="text-gray-400">+ {p.includes.length - 6} more</li>}
              </ul>
              <Link to="/waitlist"
                className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200">
                Request a quote <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-6">
        <h3 className="font-bold text-gray-900 dark:text-white">Create credits</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Making things in Studio is free. Credits cover AI generation, which costs real compute —
          and get better value the more you buy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CREDIT_BUNDLES.map((b) => (
            <div key={b.naira} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-center">
              <div className="font-bold text-gray-900 dark:text-white">₦{b.naira.toLocaleString('en-NG')}</div>
              <div className="text-xs text-gray-500">{b.credits} credits</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ItemCard({ item }: { item: CatalogueItem }) {
  const estimate = item.basis === 'indicative';
  // Free work happens in Studio, which needs an account; everything else is a
  // conversation, so it goes to the same queue as any other enquiry.
  const to = item.free ? '/studio' : '/waitlist';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{item.name}</h4>
        <span className={`text-xs font-semibold shrink-0 ${estimate ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
          {priceLabel(item)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 flex-1">{item.blurb}</p>

      {item.tiers && item.tiers.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tiers.map((t) => (
            <span key={t.qty} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {t.qty} · ₦{t.price.toLocaleString('en-NG')}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {item.turnaround && item.turnaround[1] > 0
            ? `${item.turnaround[0]}–${item.turnaround[1]} working days`
            : 'Instant'}
        </span>
        <Link to={to}
          className={`min-h-[36px] inline-flex items-center px-3 rounded-lg text-xs font-semibold ${
            item.free
              ? 'bg-pink-600 text-white hover:bg-pink-700'
              : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
          }`}>
          {item.free ? 'Create it free' : 'Request a quote'}
        </Link>
      </div>
    </div>
  );
}

export const CREATE_CATALOGUE_SIZE = CATALOGUE.length;
