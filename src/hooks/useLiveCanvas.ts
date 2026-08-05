import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Business } from '../types';
import { loadClockConfig, resolveBusinessStatus } from '../lib/businessStatus';
import { loadPromos, promoStatus } from '../lib/promotions';
import {
  LiveCanvasContext, LiveProductLike, LivePromoLike,
  resolveLiveSlots, resolveLiveText,
} from '../lib/liveCanvas';

// Builds the Live Business Canvas context for a business: live open/closed
// status and today's hours from the Business Clock, the promotion running right
// now, the catalogue's featured item, and the review count.
//
// The clock config and promos are local (localStorage), so they resolve on the
// first render with no flash. Products and reviews need a round trip; until they
// land, those tokens fall back to their standing-in text rather than showing a
// raw {{token}} — see lib/liveCanvas.ts.

const REFRESH_MS = 60_000;

export function useLiveCanvas(business: Business) {
  const businessId = String(business.id);
  const [now, setNow] = useState(() => new Date());
  const [products, setProducts] = useState<LiveProductLike[] | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);

  // Status and "days left" drift with the clock, so re-resolve on a timer. One
  // minute matches the Business Clock card's cadence.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Both queries are best-effort: a design must still render for a business
    // with no catalogue, no reviews, or no network.
    (async () => {
      const [prodRes, revRes] = await Promise.all([
        supabase
          .from('business_products')
          .select('name, price')
          .eq('business_id', businessId)
          .order('created_at', { ascending: true })
          .limit(24),
        supabase
          .from('business_reviews')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId),
      ]);
      if (cancelled) return;
      setProducts((prodRes.data as LiveProductLike[] | null) ?? []);
      setReviewCount(revRes.count ?? null);
    })().catch(() => {
      if (!cancelled) {
        setProducts([]);
        setReviewCount(null);
      }
    });

    return () => { cancelled = true; };
  }, [businessId]);

  const context = useMemo<LiveCanvasContext>(() => {
    const config = loadClockConfig(business);
    const slot = config.autoHours[now.getDay()];
    // 'live' is the running state in promotions.ts ('scheduled' hasn't started,
    // 'ended' is past) — only a running promo should appear on a design.
    const active = loadPromos(businessId).find((p) => promoStatus(p, now) === 'live');
    const promo: LivePromoLike | null = active
      ? { title: active.title, offer: active.offer, endsAt: active.endsAt }
      : null;

    return {
      business,
      now,
      status: resolveBusinessStatus(business, config, now),
      todayHours: slot ? { open: slot.open, close: slot.close, closed: !!slot.closed } : null,
      promo,
      products,
      reviewCount,
    };
  }, [business, businessId, now, products, reviewCount]);

  /** Resolve a single string — handed to the canvas via context. */
  const resolve = useCallback(
    (text: string) => resolveLiveText(text, context).text,
    [context],
  );

  /** Resolve a set of named slots and get the binding report for the coach. */
  const resolveSlots = useCallback(
    <K extends string>(slots: Record<K, string>) => resolveLiveSlots(slots, context),
    [context],
  );

  return { context, resolve, resolveSlots };
}
