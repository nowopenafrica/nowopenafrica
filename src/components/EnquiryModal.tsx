import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Send, CheckCircle, Loader2, Mail, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface EnquiryModalProps {
  businessId: string;
  businessName: string;
  businessEmail?: string;
  /** What the enquiry is about, e.g. a product name — prefills the message */
  context?: string;
  onClose: () => void;
}

export default function EnquiryModal({
  businessId, businessName, businessEmail, context, onClose,
}: EnquiryModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(context ? `Hi, I'm interested in "${context}". ` : '');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const mailtoHref = `mailto:${businessEmail || 'hello@nowopen.africa'}?subject=${encodeURIComponent(
    `Enquiry via NowOpen Africa: ${businessName}${context ? ` — ${context}` : ''}`
  )}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Sample/demo listings don't exist in the database (non-uuid ids) —
    // route those enquiries to email instead of a doomed insert.
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(businessId)) {
      window.location.href = mailtoHref;
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('business_enquiries').insert([{
        business_id: businessId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        message: message.trim(),
        context: context ?? null,
      }]);
      if (error) throw error;
      setDone(true);
    } catch (err: any) {
      console.error('Enquiry failed:', err);
      toast.error(
        `Could not send: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              Message {businessName}
            </h2>
            {context && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">About: {context}</p>}
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
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Enquiry sent</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {businessName} will get back to you at{' '}
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
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Amina Okafor"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                placeholder="What would you like to ask?"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? 'Sending…' : 'Send Enquiry'}
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
