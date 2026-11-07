import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Loader2, Lock, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canEditAdverts } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import AdvertForm from '../dashboard/AdvertForm';
import type { Advertisement } from '../../types';

/**
 * Editing a placement from the admin console.
 *
 * WHAT WAS MISSING
 *
 * The Adverts tab could flip a status and delete a row, and could not correct
 * a title, a price, a location or a photograph. A placement is inventory with
 * a rate on it: the wrong price is the wrong quote given to a customer, and
 * the only fix was the SQL editor — where nothing is audited and no guard
 * applies.
 *
 * WHY IT HOSTS THE OWNER'S FORM
 *
 * Same reason the business editor hosts the owner's forms. There is one set of
 * validation rules, one category list and one definition of what an advert is.
 * A parallel admin form would drift, and the drift would surface as placements
 * that load on one surface and not the other. `asAdmin` only removes the
 * owner scoping; the fields and their rules are shared.
 *
 * THE BOUNDARY
 *
 * Admin only, because that is what the database permits: every write policy on
 * `advertisements` for anyone else is narrowed to the row's own `user_id`
 * (20261111010000_partner_portal.sql), and the only broad write policy is
 * `is_admin()`. An editor's save would be refused by RLS, so showing them the
 * button would turn a permissions boundary into something that looks like a
 * bug. The check lives in `canEditAdverts`, and is stated on screen rather
 * than hidden as a missing button.
 *
 * EVERY EDIT IS LOGGED. Placements are often imported, and an imported row has
 * no owner watching it change. The audit entry is the record that somebody
 * did, and who.
 */

interface Props {
  advertId: string;
  /** The admin's role, from the console that opened this. */
  role: string | null | undefined;
  onClose: () => void;
  /** Refresh the list behind the modal. */
  onSaved?: () => void;
}

export default function AdminAdvertEditor({ advertId, role, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [advert, setAdvert] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // `error`, not a catch: supabase-js resolves with { error } on failure, so
    // a try/catch here would render "not found" for every failed read.
    const { data, error } = await supabase
      .from('advertisements')
      .select('*')
      .eq('id', advertId)
      .maybeSingle();

    if (error) setProblem(error.message);
    else if (!data) setProblem('That placement no longer exists.');
    else { setProblem(null); setAdvert(data as unknown as Advertisement); }
    setLoading(false);
  }, [advertId]);

  useEffect(() => { void load(); }, [load]);

  const afterSave = async () => {
    await logAudit(
      user ? { id: user.id, email: user.email } : null,
      'advert.edit',
      'advertisement',
      advertId,
      { title: advert?.title ?? null },
    );
    onSaved?.();
    onClose();
  };

  if (loading) {
    return (
      <Shell onClose={onClose} title="Loading…">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Reading the placement…
        </p>
      </Shell>
    );
  }

  if (problem || !advert) {
    return (
      <Shell onClose={onClose} title="Cannot open this placement">
        <p className="text-sm text-rose-700 dark:text-rose-300">{problem}</p>
      </Shell>
    );
  }

  if (!canEditAdverts(role)) {
    return (
      <Shell onClose={onClose} title={advert.title}>
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
          <Lock size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Only an admin can change a placement. Your role can read this row,
              and the database will refuse a save from it.
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              A placement carries a price somebody may already have been quoted.
              Ask an admin to make the change, so there is a named person behind it.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      onClose={onClose}
      title={advert.title}
      subtitle="Editing the placement customers see on NowOpen."
      href={`/adverts/${advert.id}`}
    >
      <AdvertForm
        editingId={advert.id}
        asAdmin
        onSuccess={() => { void afterSave(); }}
        onCancel={onClose}
      />
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
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${title}`}
    >
      <div className="w-full max-w-3xl my-8 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
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
