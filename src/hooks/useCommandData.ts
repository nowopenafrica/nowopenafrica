import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllBusinesses } from '../lib/fetchAllBusinesses';
import { commandCenterStats, scanLocalPipeline, type CommandRaw, type CommandStats } from '../lib/adminCreator';

// Shared by every department that needs "the state of the platform": fetch
// the same real Supabase tables the admin console uses and compute the
// CommandCenter stats. Falls back to clearly-labelled sample data when the
// backend is unreachable so internal views stay alive in dev.

const NOW = new Date().toISOString();
const SAMPLE: CommandRaw = {
  users: [
    { created_at: NOW, plan_status: 'trialing' },
    { created_at: NOW, plan_status: 'active' },
    { created_at: '2026-01-01T10:00:00Z' },
    { created_at: '2026-02-01T10:00:00Z' },
  ],
  businesses: [
    { verified: true, created_at: NOW, category: 'Restaurant' },
    { verified: true, created_at: NOW, category: 'Restaurant' },
    { verified: false, created_at: NOW, category: 'Fashion' },
    { verified: true, created_at: '2026-01-01T10:00:00Z', category: 'Beauty' },
    { verified: true, created_at: '2026-01-02T10:00:00Z', category: 'Fitness' },
  ],
  payments: [
    { status: 'paid', amount_local: 25000, currency: 'NGN', created_at: NOW },
    { status: 'paid', amount_local: 12000, currency: 'NGN', created_at: NOW },
    { status: 'paid', amount_local: 8000, currency: 'NGN', created_at: '2026-01-01T10:00:00Z' },
  ],
  verificationDocs: [{ status: 'pending' }],
  registrations: [{ status: 'open' }],
  enquiries: [{ id: 'e1' }, { id: 'e2' }],
  waitlist: [{ invited: true }, { invited: false }],
  scheduledPosts: 7,
  publishedPosts: 18,
  videoQueue: 3,
  campaigns: 4,
  uptime: 99.9,
};

export interface CommandData {
  stats: CommandStats | null;
  sample: boolean;
  loading: boolean;
  reload: () => void;
}

export function useCommandData(): CommandData {
  const [stats, setStats] = useState<CommandStats | null>(null);
  const [sample, setSample] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const local = scanLocalPipeline();
    try {
      const [
        usersRes, businessRes, paymentsRes, docsRes,
        regsRes, enquiriesRes, waitlistRes, publishLogRes,
      ] = await Promise.all([
        supabase.from('users').select('created_at, plan_status'),
        /*
         * Paged, not `.limit(50000)`.
         *
         * MEASURED 2026-10-09: 4,010 businesses. A single request is truncated
         * at PostgREST's 1,000-row cap with no error, so every figure this
         * dashboard reported about businesses — counts, verified share,
         * category mix — was computed from a quarter of the table and
         * presented as the state of the platform.
         *
         * The other tables here are read in one request on purpose: measured
         * the same day, the largest is 15 rows. If any of them ever approaches
         * a thousand it needs this treatment too.
         */
        fetchAllBusinesses<CommandRaw['businesses'][number]>({ columns: 'verified, created_at, category' }),
        supabase.from('payment_intents').select('status, amount_local, currency, created_at'),
        /*
         * `verification_documents`, not `verification_docs`.
         *
         * MEASURED 2026-10-09: the table queried here has never existed. The
         * whole request errored, `?? []` below turned that into an empty
         * slice, and the Command Center reported "0 pending verifications"
         * — which happened to be true while the real table held 0 rows, and
         * would have stayed 0 forever as documents arrived. TrustPanel and
         * AdminDashboard both had the name right; only this did not.
         */
        supabase.from('verification_documents').select('status'),
        supabase.from('business_registrations').select('status'),
        supabase.from('platform_enquiries').select('id'),
        supabase.from('waitlist').select('invited'),
        supabase.from('social_publish_log').select('status'),
      ]);
      // The core platform tables must resolve — anything else is ancillary and
      // degrades to an empty slice rather than dumping the whole dashboard.
      if (usersRes.error) throw usersRes.error;
      // The walk reports its failure as a message, not an error object.
      if (businessRes.error) throw new Error(businessRes.error);

      /*
       * Degrading to an empty slice is deliberate. Doing it SILENTLY is what
       * let a table name that never existed read as "0 pending verifications"
       * indefinitely: `?? []` gives an error and an empty table exactly the
       * same shape, so nothing anywhere could tell them apart.
       *
       * Empty is a finding. Unavailable is a fault. They are not the same,
       * and this is the line that says which one happened.
       */
      const ancillary: { table: string; error: { message: string } | null }[] = [
        { table: 'payment_intents', error: paymentsRes.error },
        { table: 'verification_documents', error: docsRes.error },
        { table: 'business_registrations', error: regsRes.error },
        { table: 'platform_enquiries', error: enquiriesRes.error },
        { table: 'waitlist', error: waitlistRes.error },
        { table: 'social_publish_log', error: publishLogRes.error },
      ];
      for (const { table, error } of ancillary) {
        if (error) console.warn(`[command-center] ${table} is unavailable and is being counted as empty: ${error.message}`);
      }
      const backendPublished = (publishLogRes.data ?? [])
        .filter((l) => l.status === 'ok' || l.status === 'simulated').length;
      setStats(commandCenterStats({
        users: usersRes.data ?? [],
        businesses: businessRes.data ?? [],
        payments: paymentsRes.data ?? [],
        verificationDocs: docsRes.data ?? [],
        registrations: regsRes.data ?? [],
        enquiries: enquiriesRes.data ?? [],
        waitlist: waitlistRes.data ?? [],
        scheduledPosts: local.scheduledPosts,
        publishedPosts: backendPublished + local.publishedPosts,
        videoQueue: local.videoQueue,
        campaigns: local.campaigns,
        // There is no uptime monitor wired up. This was a hardcoded 99.9 on the
        // LIVE path, sitting among figures that are all real queries — so the
        // one number nobody measured was the one that looked best, and it fed
        // the founder score a permanent 10/10. Null until something watches it.
        uptime: null,
      }));
      setSample(false);
    } catch {
      setStats(commandCenterStats({ ...SAMPLE, ...local }));
      setSample(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { stats, sample, loading, reload: load };
}
