import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, CalendarCheck, CheckCircle, Loader2, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CategoryFeatureConfig } from '../data/categoryFeatures';

interface BookingItem {
  id: string;
  name: string;
  price?: string;
}

interface BookingModalProps {
  businessId: string;
  businessName: string;
  businessEmail?: string;
  feature: CategoryFeatureConfig;
  /** business_services or business_products rows, depending on feature.itemSource */
  items: BookingItem[];
  /** Pre-select an item, e.g. when opened from a specific product/service card */
  initialItemId?: string;
  onClose: () => void;
}

export default function BookingModal({
  businessId, businessName, businessEmail, feature, items, initialItemId, onClose,
}: BookingModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [itemId, setItemId] = useState(initialItemId ?? '');
  const [date, setDate] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [time, setTime] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const mailtoHref = `mailto:${businessEmail || 'hello@nowopen.africa'}?subject=${encodeURIComponent(
    `${feature.ctaLabel} request via NowOpen Africa: ${businessName}`
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Sample/demo listings don't exist in the database (non-uuid ids) —
    // route those requests to email instead of a doomed insert.
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(businessId)) {
      window.location.href = mailtoHref;
      return;
    }

    setSubmitting(true);
    try {
      const selectedItem = items.find(i => i.id === itemId);
      const { error } = await supabase.from('business_bookings').insert([{
        business_id: businessId,
        item_type: feature.itemSource === 'none' ? null : feature.itemSource,
        item_id: feature.itemSource === 'none' ? null : (itemId || null),
        item_name: feature.itemSource === 'none' ? null : (selectedItem?.name ?? null),
        item_price: feature.itemSource === 'none' ? null : (selectedItem?.price ?? null),
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        customer_phone: phone.trim() || null,
        requested_date: feature.showDate && date ? date : null,
        requested_date_end: feature.showDateRange && dateEnd ? dateEnd : null,
        requested_time: feature.showTime && time ? time : null,
        quantity: feature.showQuantity && quantity ? parseInt(quantity, 10) : null,
        notes: notes.trim() || null,
      }]);
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      console.error('Booking request failed:', err);
      toast.error(
        `Could not send: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {feature.ctaLabel} — {businessName}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Request sent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {businessName} will review your request and confirm at{' '}
              <span className="font-medium text-gray-900 dark:text-white">{email}</span>.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {feature.itemSource !== 'none' && items.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{feature.itemLabel ?? 'Item'}</label>
                <select
                  required
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select {feature.itemLabel ?? 'an item'}</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.price ? ` — ${item.price}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Amina Okafor"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={320}
                placeholder="you@business.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone number <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={30}
                  placeholder="+234 801 234 5678"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {(feature.showDate || feature.showDateRange) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {feature.showDateRange ? 'Check-in' : 'Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {feature.showDateRange && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Check-out</label>
                    <input
                      type="date"
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                      min={date || undefined}
                      className={inputCls}
                    />
                  </div>
                )}
                {feature.showTime && !feature.showDateRange && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            )}

            {feature.showQuantity && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{feature.quantityLabel ?? 'Quantity'}</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                placeholder="Anything the business should know"
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CalendarCheck size={16} />}
              {submitting ? 'Sending…' : feature.ctaLabel}
            </button>

            <a
              href={mailtoHref}
              className="flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              <Mail size={13} />
              …or send from your own email app
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
