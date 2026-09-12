import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Loader2, X, Pencil, Sparkles, LayoutList, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canEditBusinessProfile } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import BusinessForm from '../dashboard/BusinessForm';
import BusinessStoryEditor from '../dashboard/BusinessStoryEditor';
import BusinessContentManager from '../dashboard/BusinessContentManager';
import type { Business } from '../../types';

/**
 * Editing a listing NowOpen maintains on a business's behalf.
 *
 * WHY THIS EXISTS
 *
 * 269 of the 271 businesses on the platform are unclaimed — imported, and
 * nobody's yet. The admin console could verify them, change their status,
 * review their trust and delete them, and could not change a single DETAIL.
 * A wrong phone number, a missing set of hours or a bad banner on a listing we
 * published ourselves had no fix short of the SQL editor.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * A second editor. It hosts the same three the owner uses, so there is one
 * place where a business's details are validated, one username rule, one
 * opening-hours parser. A parallel admin form would drift within a month and
 * the drift would show up as two businesses with incompatible data.
 *
 * THE BOUNDARY
 *
 * Only until it is claimed. The moment an owner holds the profile it is their
 * page and their words, and an admin quietly editing it is a stranger
 * rewriting a business's own description with no way for them to know. The
 * rule lives in `canEditBusinessProfile`, is enforced again by a database
 * trigger, and is stated on screen rather than hidden as a missing button.
 *
 * EVERY EDIT IS LOGGED. An unclaimed profile has nobody to notice a change, so
 * the audit trail is the only record that one happened.
 */

type Tab = 'details' | 'story' | 'content';

interface Props {
  businessId: string;
  /** The admin's role, from the console that opened this. */
  role: string | null | undefined;
  onClose: () => void;
  /** Refresh the list behind the modal. */
  onSaved?: () => void;
}

export default function AdminBusinessEditor({ businessId, role, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('details');

  const load = useCallback(async () => {
    setLoading(true);
    // `error`, not a catch: supabase-js resolves with { error } on failure, so
    // a try/catch here would render "not found" for every failed read.
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .maybeSingle();

    if (error) setProblem(error.message);
    else if (!data) setProblem('That business no longer exists.');
    else { setProblem(null); setBusiness(data as unknown as Business); }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const afterSave = async (what: string) => {
    if (business) {
      await logAudit(
        user ? { id: user.id, email: user.email } : null,
        'business.edit',
        'business',
        businessId,
        {
          name: business.name,
          section: what,
          claim_status: (business as unknown as Record<string, unknown>).claim_status ?? null,
        },
      );
    }
    toast.success('Saved');
    await load();
    onSaved?.();
  };

  if (loading) {
    return (
      <Shell onClose={onClose} title="Loading…">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Reading the listing…
        </p>
      </Shell>
    );
  }

  if (problem || !business) {
    return (
      <Shell onClose={onClose} title="Cannot open this listing">
        <p className="text-sm text-rose-700 dark:text-rose-300">{problem}</p>
      </Shell>
    );
  }

  const row = business as unknown as Record<string, unknown>;
  const verdict = canEditBusinessProfile(role, {
    claim_status: (row.claim_status as string) ?? null,
    user_id: (row.user_id as string) ?? null,
  });

  if (!verdict.allowed) {
    return (
      <Shell onClose={onClose} title={business.name}>
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
          <Lock size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm text-amber-900 dark:text-amber-100">{verdict.reason}</p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              A claimed profile belongs to the business. If they have asked for a change, the
              change should come from them — or be made with a named person behind it, not
              silently from this console.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const TABS: { id: Tab; label: string; icon: typeof Pencil }[] = [
    { id: 'details', label: 'Details', icon: Pencil },
    { id: 'story', label: 'Story & profile', icon: Sparkles },
    { id: 'content', label: 'Services & content', icon: LayoutList },
  ];

  return (
    <Shell
      onClose={onClose}
      title={business.name}
      subtitle={verdict.reason}
      href={business.username ? `/${business.username}` : `/businesses/${business.id}`}
    >
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium border-b-2 transition ${
              tab === t.id
                ? 'border-purple-600 text-purple-700 dark:text-purple-300'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <BusinessForm
          editingId={businessId}
          onSuccess={() => { void afterSave('details'); }}
          onCancel={onClose}
        />
      )}

      {/*
        * The owner's own editors, opened on somebody else's listing. Both are
        * modals in their own right, so they render over this one and close
        * back to it.
        */}
      {tab === 'story' && (
        <BusinessStoryEditor
          business={business}
          onClose={() => setTab('details')}
          onSaved={() => { void afterSave('story'); }}
        />
      )}

      {tab === 'content' && (
        <BusinessContentManager
          businessId={business.id}
          businessName={business.name}
          category={(row.category as string) ?? ''}
          enabledModules={(row.enabled_modules as string[]) ?? []}
          location={(row.location as string) ?? ''}
          phone={(row.phone as string) ?? ''}
          openingHours={((row.opening_hours as string) ?? (row.hours as string)) ?? ''}
          timezone={(row.timezone as string) ?? ''}
          onClose={() => setTab('details')}
        />
      )}
    </Shell>
  );
}

/** The modal frame, so every state above looks the same. */
function Shell({
  title, subtitle, href, onClose, children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${title}`}
    >
      <div className="w-full max-w-4xl my-8 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {href && (
              <Link
                to={href}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 min-h-[44px] px-2"
              >
                <ExternalLink size={13} /> View page
              </Link>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 min-h-[44px] px-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
