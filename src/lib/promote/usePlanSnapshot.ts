/**
 * The plan as the current visitor has it, for the tray.
 *
 * Signed in: the newest plan's lines. Signed out: the browser-held lines,
 * resolved against the live catalogue. A read that fails sets `failed`; it is
 * never reported as an empty plan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { summarise, type PlanLine, type PlanSummary } from './campaignPlan';
import { fetchCampaigns, fetchLocalPlanLines, fetchPlanLines } from './campaigns';
import { onPlanChanged, readLocalPlan } from './localPlan';

export interface PlanSnapshot {
  lines: PlanLine[];
  summary: PlanSummary | null;
  planId: string | null;
  loading: boolean;
  failed: boolean;
}

interface Read {
  lines: PlanLine[];
  planId: string | null;
  failed: boolean;
}

export function usePlanSnapshot(): PlanSnapshot {
  const { user, loading: authLoading } = useAuth();
  const { ngnPerUsd } = useCurrency();
  const userId = user?.id ?? null;
  const [read, setRead] = useState<Read | null>(null);
  /** Bumped by every load so a slow, older read cannot overwrite a newer one. */
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    let next: Read;
    try {
      if (userId) {
        const campaigns = await fetchCampaigns();
        if (campaigns.state !== 'ready') {
          next = { lines: [], planId: null, failed: true };
        } else if (campaigns.campaigns.length === 0) {
          next = { lines: [], planId: null, failed: false };
        } else {
          const planId = campaigns.campaigns[0].id;
          next = { lines: await fetchPlanLines(planId), planId, failed: false };
        }
      } else {
        const local = readLocalPlan();
        next = {
          lines: local.length ? await fetchLocalPlanLines(local) : [],
          planId: null,
          failed: false,
        };
      }
    } catch {
      next = { lines: [], planId: null, failed: true };
    }
    if (mine === seq.current) setRead(next);
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    setRead(null);
    void load();
    const off = onPlanChanged(() => { void load(); });
    return () => {
      seq.current++; // drop any read still in flight for the old identity
      off();
    };
  }, [authLoading, load]);

  const summary = useMemo(
    () => (read && read.lines.length ? summarise(read.lines, ngnPerUsd) : null),
    [read, ngnPerUsd],
  );

  return {
    lines: read?.lines ?? [],
    summary,
    planId: read?.planId ?? null,
    loading: authLoading || read === null,
    failed: read?.failed ?? false,
  };
}
