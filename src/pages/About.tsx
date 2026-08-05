import { Link } from 'react-router-dom';
import { Compass, Megaphone, Palette, ShieldCheck, ArrowRight } from 'lucide-react';

const pillars = [
  { icon: Compass, title: 'Discover', text: 'A living directory of African businesses — searchable by what they do, where they are, and how they’re rated.' },
  { icon: Megaphone, title: 'Advertise', text: 'Book real-world ad placements — billboards, transit, digital screens — and run managed digital campaigns.' },
  { icon: Palette, title: 'Create', text: 'Hire vetted photographers, designers, videographers and studios across the continent.' },
  { icon: ShieldCheck, title: 'Trust', text: 'Tiered verification and transparent trust scores so customers can transact with confidence.' },
];

export default function About() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 45%, #831843 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-3xl md:text-5xl font-bold">The operating system for business growth in Africa</h1>
          <p className="mt-4 text-blue-100 text-base md:text-lg max-w-2xl mx-auto">
            NowOpen Africa helps businesses get discovered, advertise effectively, and hire the creative talent
            they need — all in one place, built for African markets.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Why we exist</h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Millions of African businesses are open for business but hard to find, hard to reach, and hard to trust
            online. Customers waste time; good businesses lose out. NowOpen Africa closes that gap — a single platform
            where a business can build a real presence, take bookings and orders, run advertising, go live, and earn
            verified trust, priced for the realities of the markets it serves.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">What we do</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pillars.map((p) => (
              <div key={p.title} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <p.icon size={22} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="mt-3 font-bold text-gray-900 dark:text-white">{p.title}</h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Built in Africa, for Africa</h2>
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Local currencies and mobile-money-friendly checkout, per-industry tools instead of one generic template,
            and a trust layer designed for how business really gets done across the continent. We're just getting
            started — and we'd love you to build it with us.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/waitlist" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
              Join the waitlist <ArrowRight size={16} />
            </Link>
            <Link to="/founder" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              Meet the founder
            </Link>
            <Link to="/contact" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              Contact us
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
