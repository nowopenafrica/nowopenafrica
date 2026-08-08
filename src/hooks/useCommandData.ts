import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
        supabase.from('businesses').select('verified, created_at, category'),
        supabase.from('payment_intents').select('status, amount_local, currency, created_at'),
        supabase.from('verification_docs').select('status'),
        supabase.from('business_registrations').select('status'),
        supabase.from('platform_enquiries').select('id'),
        supabase.from('waitlist').select('invited'),
        supabase.from('social_publish_log').select('status'),
      ]);
      // The core platform tables must resolve — anything else is ancillary and
      // degrades to an empty slice rather than dumping the whole dashboard.
      if (usersRes.error || businessRes.error) throw usersRes.error ?? businessRes.error;
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
        uptime: 99.9,
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
