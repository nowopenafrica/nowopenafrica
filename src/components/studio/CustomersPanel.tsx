import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users, Search, MessageCircle, Download, Loader2, RefreshCw, Star, ShoppingBag } from 'lucide-react';

import { Business } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  buildCustomers, segmentCounts, inSegment, searchCustomers, lastSeenLabel,
  messageOpener, SEGMENTS,
  type Customer, type SegmentKey, type BookingRow, type EnquiryRow, type ReviewRow,
} from '../../lib/crm';
import { whatsappHref } from '../../lib/phone';
import { downloadText, slugForFile } from '../../lib/studio';
import { localDateISO } from '../../lib/dates';

interface Props {
  business: Business;
}

/**
 * The customers a business already has.
 *
 * Built from bookings, enquiries and reviews rather than a customers table —
 * see src/lib/crm.ts for why. The practical consequence is worth knowing: this
 * shows real people from the first booking, and there is nothing to migrate.
 *
 * The thing an owner comes here to do is not "browse a database". It is
 * "message the people who bought from me last month", so the segment is the
 * primary control and every row has a way to reach the person on it.
 */
export default function CustomersPanel({ business }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<SegmentKey>('all');
  const [query, setQuery] = useState('');
  const businessId = String(business.id);

  const load = useCallback(async () => {
    setLoading(true);
    // Each table is optional on a fresh project, and a business with no
    // enquiries should still see its bookings — so a failure degrades to an
    // empty list rather than an error screen.
    const [bookings, enquiries, reviews] = await Promise.all([
      supabase.from('business_bookings')
        .select('id,customer_name,customer_email,customer_phone,item_name,status,created_at')
        .eq('business_id', businessId).order('created_at', { ascending: false }).limit(1000),
      supabase.from('business_enquiries')
        .select('id,name,email,phone,context,created_at')
        .eq('business_id', businessId).order('created_at', { ascending: false }).limit(1000),
      supabase.from('business_reviews')
        .select('id,author_name,rating,created_at')
        .eq('business_id', businessId).order('created_at', { ascending: false }).limit(500),
    ]);
    setCustomers(buildCustomers(
      (bookings.data as BookingRow[]) || [],
      (enquiries.data as EnquiryRow[]) || [],
      (reviews.data as ReviewRow[]) || [],
    ));
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => segmentCounts(customers), [customers]);
  const shown = useMemo(
    () => searchCustomers(customers.filter((c) => inSegment(c, segment)), query),
    [customers, segment, query],
  );

  const message = (c: Customer) => {
    const opener = messageOpener(business.name, c);
    // whatsappHref returns null for a number it cannot normalise; without a
    // phone there is no chat to open, so the button is not offered at all.
    const href = c.phone ? whatsappHref(c.phone, business.location, opener) : null;
    if (href) { window.open(href, '_blank', 'noopener'); return; }
    if (c.email) { window.open(`mailto:${c.email}?body=${encodeURIComponent(opener)}`, '_blank', 'noopener'); return; }
    toast.error('No phone or email on file for this customer.');
  };

  /**
   * Export the visible segment.
   *
   * CSV rather than a copyable blob, because the realistic next step is a
   * bulk-messaging tool or a spreadsheet, and both want a file. Exports exactly
   * what is on screen — exporting more than the owner filtered to would be a
   * surprise with people's contact details in it.
   */
  const exportCsv = () => {
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const rows = [
      ['Name', 'Email', 'Phone', 'Bookings', 'Enquiries', 'Reviews', 'First seen', 'Last seen', 'Bought'].join(','),
      ...shown.map((c) => [
        esc(c.name), esc(c.email || ''), esc(c.phone || ''),
        c.bookings, c.enquiries, c.reviews,
        esc(c.firstSeen?.slice(0, 10) || ''), esc(c.lastSeen?.slice(0, 10) || ''),
        esc(c.bought.join(' | ')),
      ].join(',')),
    ].join('\n');
    downloadText(rows, `${slugForFile(business.name)}-customers-${segment}-${localDateISO()}.csv`, 'text/csv;charset=utf-8');
    toast.success(`${shown.length} customer${shown.length === 1 ? '' : 's'} exported`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users size={15} /> Customers
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {loading
              ? 'Reading your bookings, enquiries and reviews…'
              : `${customers.length} ${customers.length === 1 ? 'person has' : 'people have'} booked, enquired or reviewed.`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px] disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Segments first: the reason to open this screen is usually to reach a
          group, not to look up one person. */}
      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSegment(s.key)}
            aria-pressed={segment === s.key}
            title={s.blurb}
            className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-xs font-semibold transition ${
              segment === s.key
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {s.label}
            <span className={segment === s.key ? 'text-white/80' : 'text-gray-400'}>{counts[s.key]}</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        {SEGMENTS.find((s) => s.key === segment)?.blurb}
      </p>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, email or what they bought"
            aria-label="Search customers"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-h-[44px]"
          />
        </div>
        <button onClick={exportCsv} disabled={shown.length === 0}
          className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px] disabled:opacity-50">
          <Download size={15} /> Export ({shown.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-8">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
          <Users size={22} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {customers.length === 0
              ? 'No customers yet. They appear here the moment someone books or sends an enquiry.'
              : 'Nobody in this segment right now.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <div key={c.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                </p>
                {c.bought.length > 0 && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1 mt-0.5">
                    <ShoppingBag size={11} /> {c.bought.slice(0, 3).join(', ')}
                  </p>
                )}
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{lastSeenLabel(c)}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5 justify-end">
                  {c.bookings > 0 && <span>{c.bookings} booking{c.bookings === 1 ? '' : 's'}</span>}
                  {c.reviews > 0 && <span className="inline-flex items-center gap-0.5"><Star size={10} className="fill-amber-400 text-amber-400" />{c.reviews}</span>}
                </p>
              </div>

              <button
                onClick={() => message(c)}
                disabled={!c.phone && !c.email}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-[#25D366] text-white text-xs font-semibold hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageCircle size={14} /> Message
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
