import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, Plus, Trash2, Loader2, Star } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  sortLocations, locationOpenState, normaliseLocation, locationsSummary,
  type BusinessLocation, type LocationFallback,
} from '../../lib/locations';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Where an owner adds their branches.
 *
 * A chain used to have to register each branch as a separate business, which
 * split the brand across five listings with five ratings and five half-empty
 * catalogues. Branches keep one profile and share the catalogue and reviews.
 *
 * Every field except the name is optional and falls back to the parent's, so
 * adding a branch that keeps the usual hours is one field and a save. Making an
 * owner restate the whole timetable per branch is how branch hours end up
 * wrong.
 */
interface Props {
  /** Only the fields a branch inherits, so this can mount anywhere. */
  business: LocationFallback & { id: string | number };
  /** Lets a parent tab show the count without owning the list. */
  onCountChange?: (count: number) => void;
}

const EMPTY: Partial<BusinessLocation> = {
  name: '', address: '', phone: '', opening_hours: '', timezone: '', open_status: null, is_primary: false,
};

export default function LocationsManager({ business, onCountChange }: Props) {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Partial<BusinessLocation>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BusinessLocation | null>(null);
  const businessId = String(business.id);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_locations')
      .select('id,name,address,phone,opening_hours,timezone,open_status,latitude,longitude,is_primary')
      .eq('business_id', businessId);
    if (error && !/does not exist/i.test(error.message)) {
      toast.error(`Could not load branches: ${error.message}`);
    }
    const rows = (data as BusinessLocation[]) || [];
    setLocations(rows);
    onCountChange?.(rows.length);
    setLoading(false);
  }, [businessId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!(draft.name || '').trim()) { toast.error('Give the branch a name first.'); return; }
    setSaving(true);
    const row = normaliseLocation(draft);
    // A partial unique index allows only one primary per business, so an
    // existing flagship has to stand down before this one takes over —
    // otherwise the insert fails with a constraint error the owner cannot act on.
    if (row.is_primary) {
      await supabase.from('business_locations').update({ is_primary: false }).eq('business_id', businessId);
    }
    const { error } = await supabase.from('business_locations').insert([{ ...row, business_id: businessId }]);
    setSaving(false);
    if (error) {
      toast.error(
        /does not exist/i.test(error.message)
          ? 'Branches need the business_locations migration applied first.'
          : `Could not add the branch: ${error.message}`,
      );
      return;
    }
    setDraft(EMPTY);
    toast.success(`${row.name} added`);
    load();
  };

  const makePrimary = async (loc: BusinessLocation) => {
    await supabase.from('business_locations').update({ is_primary: false }).eq('business_id', businessId);
    const { error } = await supabase.from('business_locations').update({ is_primary: true }).eq('id', loc.id);
    if (error) { toast.error(`Could not set the main branch: ${error.message}`); return; }
    toast.success(`${loc.name} is now the main branch`);
    load();
  };

  const confirmDelete = async () => {
    const loc = pendingDelete;
    setPendingDelete(null);
    if (!loc) return;
    const { error } = await supabase.from('business_locations').delete().eq('id', loc.id);
    if (error) { toast.error(`Could not remove the branch: ${error.message}`); return; }
    toast.success(`${loc.name} removed`);
    load();
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-h-[44px]';
  const label = 'block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1';
  const ordered = sortLocations(locations, business);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 size={15} /> Branches
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {loading ? 'Loading…' : locations.length === 0
            ? 'One brand, many locations. Each branch keeps its own hours and phone; the catalogue and reviews stay shared.'
            : locationsSummary(locations, business)}
        </p>
      </div>

      {!loading && ordered.length > 0 && (
        <div className="space-y-2">
          {ordered.map((loc) => {
            const state = locationOpenState(loc, business);
            return (
              <div key={loc.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {loc.name}
                    {loc.is_primary && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-500">Main</span>}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {[loc.address, loc.phone].filter(Boolean).join(' · ') || 'Uses the main details'}
                  </p>
                  <p className="text-[11px] text-gray-400">{state.label}{state.detail ? ` · ${state.detail}` : ''}</p>
                </div>
                {!loc.is_primary && (
                  <button onClick={() => makePrimary(loc)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Star size={13} /> Make main
                  </button>
                )}
                <button onClick={() => setPendingDelete(loc)} aria-label={`Remove ${loc.name}`}
                  className="inline-flex items-center justify-center w-[44px] min-h-[44px] rounded-lg text-gray-400 hover:text-red-600 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-900 dark:text-white">Add a branch</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label} htmlFor="loc-name">Branch name</label>
            <input id="loc-name" className={field} value={draft.name || ''} maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Lekki Phase 1" /></div>
          <div><label className={label} htmlFor="loc-address">Address</label>
            <input id="loc-address" className={field} value={draft.address || ''} maxLength={200}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder={business.location || 'Street, city'} /></div>
          <div><label className={label} htmlFor="loc-phone">Phone</label>
            <input id="loc-phone" className={field} value={draft.phone || ''} maxLength={24}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder={business.phone || '0801…'} /></div>
          <div><label className={label} htmlFor="loc-hours">Opening hours</label>
            <input id="loc-hours" className={field} value={draft.opening_hours || ''} maxLength={200}
              onChange={(e) => setDraft({ ...draft, opening_hours: e.target.value })}
              placeholder={business.opening_hours || 'Mon-Sat: 9AM-8PM'} /></div>
        </div>
        {/* Said plainly, because the alternative is an owner retyping the same
            hours onto every branch and one of them going stale. */}
        <p className="text-[11px] text-gray-400">
          Leave anything blank and this branch uses your main details.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 min-h-[44px]">
            <input type="checkbox" checked={!!draft.is_primary} className="accent-purple-600"
              onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })} />
            This is the main branch
          </label>
          <button onClick={add} disabled={saving}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add branch
          </button>
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Remove ${pendingDelete.name}?`}
          message="The branch disappears from your profile. Your catalogue, reviews and the rest of the business are untouched."
          confirmLabel="Remove branch"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
