import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Clock, Send } from 'lucide-react';
import SocialLinks from '../components/SocialLinks';
import { applySeo } from '../lib/seo';

const SUPPORT_EMAIL = 'hello@nowopenafrica.com';

const channels = [
  { icon: Mail, label: 'Email', value: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { icon: Phone, label: 'Phone', value: '+234 (708) 154-7726', href: 'tel:+2347081547726' },
  { icon: MapPin, label: 'Location', value: 'Lagos, Nigeria · Serving 20+ African markets' },
  { icon: Clock, label: 'Response time', value: 'Within 1–2 business days' },
];

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    return applySeo({
      title: 'Contact NowOpen Africa',
      description:
        'Questions, partnerships or press — reach the NowOpen Africa team by email, phone or WhatsApp. We respond within 1–2 business days.',
      path: '/contact',
      image: '/og-image.png',
    });
  }, []);

  // Opens the visitor's email client pre-filled — no backend dependency, so it
  // works reliably regardless of database state.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Website enquiry from ${name || 'a visitor'}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}${email ? ` (${email})` : ''}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">Get in touch</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            Questions, partnerships, or press — we'd love to hear from you. Reach us directly or send a message below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Channels */}
          <div className="lg:col-span-2 space-y-4">
            {channels.map((c) => {
              const inner = (
                <div className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <c.icon size={18} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{c.label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{c.value}</p>
                  </div>
                </div>
              );
              return c.href
                ? <a key={c.label} href={c.href} className="block hover:opacity-90 transition">{inner}</a>
                : <div key={c.label}>{inner}</div>;
            })}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Follow us</p>
              <SocialLinks />
            </div>
          </div>

          {/* Message form */}
          <form onSubmit={handleSubmit} className="lg:col-span-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="How can we help?" />
            </div>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
              <Send size={16} /> Send message
            </button>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              This opens your email app pre-filled. Prefer to write directly? Email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-blue-600 dark:text-blue-400 hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
