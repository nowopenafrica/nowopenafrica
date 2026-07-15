import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { CheckCircle, Mail, Rocket, BadgeCheck, Gift, Users, ArrowRight, Sparkles } from 'lucide-react';

const BUSINESS_TYPES = [
  'Business owner — I want to be discovered',
  'Advertiser — I want to book ad placements',
  'Placement owner — I have ad space to sell',
  'Creative professional — I offer media services',
  'Agency — I manage campaigns for clients',
  'Other',
];

const COUNTRIES = [
  'Nigeria', 'Kenya', 'Ghana', 'South Africa', 'Egypt', 'Ethiopia', 'Tanzania',
  'Uganda', 'Rwanda', 'Senegal', "Côte d'Ivoire", 'Morocco', 'Cameroon',
  'Zambia', 'Zimbabwe', 'Botswana', 'Namibia', 'Mozambique', 'DR Congo',
  'Algeria', 'Tunisia', 'Other',
];

const perks = [
  {
    icon: Gift,
    title: 'Founding member pricing',
    text: 'Lock in launch pricing for 12 months on any plan.',
  },
  {
    icon: BadgeCheck,
    title: 'Free verified badge',
    text: 'Skip the queue — founding businesses get verified free.',
  },
  {
    icon: Rocket,
    title: 'Early access',
    text: 'Invites go out in order of signup, market by market.',
  },
];

export default function Waitlist() {
  const [form, setForm] = useState({ name: '', email: '', business_type: '', country: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from('waitlist').insert([{
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        business_type: form.business_type,
        country: form.country,
        source: 'website',
      }]);

      if (error) {
        // 23505 = unique violation → they're already on the list
        if (error.code === '23505') {
          setDone(true);
          toast.success("You're already on the list!");
          return;
        }
        throw error;
      }
      setDone(true);
      toast.success('Welcome to the waitlist!');
    } catch (err: any) {
      console.error('Waitlist signup failed:', err);
      toast.error(`Could not join the waitlist: ${err.message || 'unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-10 text-center space-y-5">
          <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You're on the list! 🎉</h1>
          <p className="text-gray-600">
            We'll email <span className="font-medium text-gray-900">{form.email}</span> your
            invite as we open up{form.country ? ` in ${form.country}` : ''}. Founding members
            are invited first, market by market.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Explore the Platform
            </Link>
            <Link
              to="/pricing"
              className="px-6 py-3 bg-gray-100 text-gray-800 font-medium rounded-lg hover:bg-gray-200 transition"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Pitch */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
              <Sparkles size={16} className="text-yellow-300" />
              Invite-only early access
            </div>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight">
              Be first when Africa's business growth ecosystem
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                goes live
              </span>
            </h1>
            <p className="text-blue-100 text-base md:text-lg">
              NowOpen Africa connects businesses, advertising placements and creative
              professionals across 20+ African markets. Join the waitlist and we'll send
              your invite as we open your market.
            </p>
            <div className="flex items-center gap-3 text-sm text-blue-100">
              <Users size={18} />
              Businesses, advertisers and creators from 21 countries are already in line.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {perks.map(perk => (
                <div key={perk.title} className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <perk.icon size={20} className="text-yellow-300 mb-2" />
                  <h3 className="font-semibold text-sm mb-1">{perk.title}</h3>
                  <p className="text-xs text-blue-100">{perk.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-gray-900">
            <h2 className="text-xl font-bold mb-1">Join the waitlist</h2>
            <p className="text-sm text-gray-600 mb-6">Takes 30 seconds. No payment needed.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Amina Okafor"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="you@business.com"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">I am a…</label>
                <select
                  required
                  value={form.business_type}
                  onChange={e => setForm({ ...form, business_type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="" disabled>Select what describes you best</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
                <select
                  required
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="" disabled>Select your country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? 'Joining…' : 'Get My Invite'}
                {!submitting && <ArrowRight size={18} />}
              </button>
              <p className="text-xs text-gray-500 text-center">
                We'll only email you about your invite and launch news. No spam, ever.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
          How the invite rollout works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Join the list', text: 'Tell us who you are and where you operate — that decides your rollout wave.' },
            { step: '2', title: 'Get your invite', text: 'We open market by market, starting with Nigeria, Kenya, Ghana, South Africa and Egypt.' },
            { step: '3', title: 'Launch day setup', text: 'Claim your profile, get verified free, and start listing, booking or selling from day one.' },
          ].map(s => (
            <div key={s.step} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mb-4">
                {s.step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{s.title}</h3>
              <p className="text-sm text-gray-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
