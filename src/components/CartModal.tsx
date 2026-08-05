import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, ShoppingCart, CheckCircle, Loader2, Mail, Minus, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface CartLine {
  productId: string;
  name: string;
  price?: string;
  quantity: number;
}

interface CartModalProps {
  businessId: string;
  businessName: string;
  businessEmail?: string;
  moduleKey: string;
  lines: CartLine[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CartModal({
  businessId, businessName, businessEmail, moduleKey, lines, onUpdateQuantity, onRemove, onClose, onSuccess,
}: CartModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const summary = lines.map(l => `${l.name} x${l.quantity}`).join(', ');
  const mailtoHref = `mailto:${businessEmail || 'hello@nowopen.africa'}?subject=${encodeURIComponent(
    `Order via NowOpen Africa: ${businessName}`
  )}&body=${encodeURIComponent(summary)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) return;

    // Sample/demo listings don't exist in the database (non-uuid ids) —
    // route those orders to email instead of a doomed insert.
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(businessId)) {
      window.location.href = mailtoHref;
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('business_bookings').insert([{
        business_id: businessId,
        module_key: moduleKey,
        items: lines.map(l => ({ id: l.productId, name: l.name, price: l.price ?? null, quantity: l.quantity })),
        customer_name: name.trim(),
        customer_email: email.trim().toLowerCase(),
        customer_phone: phone.trim() || null,
        notes: notes.trim() || null,
      }]);
      if (error) throw error;
      setDone(true);
      onSuccess();
    } catch (err: any) {
      console.error('Order failed:', err);
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
            Your Cart — {businessName}
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Order sent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {businessName} will review your order and confirm at{' '}
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
          <>
            {lines.length === 0 ? (
              <div className="p-8 text-center">
                <ShoppingCart size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Your cart is empty.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700 px-5">
                {lines.map(line => (
                  <li key={line.productId} className="py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{line.name}</p>
                      {line.price && <p className="text-xs text-blue-600 dark:text-blue-400">{line.price}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(line.productId, Math.max(1, line.quantity - 1))}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-6 text-center text-sm text-gray-900 dark:text-white">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(line.productId, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(line.productId)}
                        aria-label={`Remove ${line.name}`}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded ml-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {lines.length > 0 && (
              <form onSubmit={handleSubmit} className="p-5 pt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
                  <input
                    type="text" required value={name} onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                    placeholder="Amina Okafor" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your email</label>
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    maxLength={320}
                    placeholder="you@business.com" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone number <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
                  <input
                    type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    maxLength={30}
                    placeholder="+234 801 234 5678" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span></label>
                  <textarea
                    rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                    maxLength={2000}
                    placeholder="Delivery address, preferences, etc." className={inputCls}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                  {submitting ? 'Sending…' : 'Place Order'}
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
          </>
        )}
      </div>
    </div>
  );
}
