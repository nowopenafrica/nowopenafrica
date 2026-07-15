import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles, Building2, Rocket, Crown, ChevronDown } from 'lucide-react';

const plans = (annual: boolean) => [
  {
    name: 'Starter',
    icon: Building2,
    price: 0,
    tagline: 'For every business getting discovered',
    features: [
      '1 business listing',
      'Standard business profile page',
      'Browse ad placements & creative services',
      'Book placements (pay per booking)',
      'Community support',
    ],
    cta: 'Join Free',
    highlight: false,
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
  },
  {
    name: 'Growth',
    icon: Rocket,
    price: annual ? 12 : 15,
    tagline: 'For businesses ready to advertise',
    features: [
      'Up to 3 business listings',
      'Verified badge on all listings',
      '5 active advert campaigns',
      'Eligible for homepage features',
      'Campaign analytics dashboard',
      'Priority email & WhatsApp support',
    ],
    cta: 'Start Growing',
    highlight: true,
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
  },
  {
    name: 'Pro',
    icon: Crown,
    price: annual ? 31 : 39,
    tagline: 'For agencies & multi-location brands',
    features: [
      'Unlimited business listings',
      'Unlimited advert campaigns',
      'Featured placement across the platform',
      'Advanced analytics & exportable reports',
      '0% booking fees on creative services',
      'Dedicated account manager',
      'Early access to new markets & features',
    ],
    cta: 'Go Pro',
    highlight: false,
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
  },
];

const faqs = [
  {
    q: 'How does placement pricing work?',
    a: 'Advertising placements are priced per day by the placement owner — from around $110/day for city boards in emerging markets to $900/day for premium digital spectaculars in Lagos, Johannesburg or Cairo. You only pay for the days you book, on any plan.',
  },
  {
    q: 'What are the booking fees?',
    a: 'Starter and Growth bookings include a 10% platform fee that funds verification, secure payments and support. Pro members pay 0% booking fees on creative services.',
  },
  {
    q: 'Can I pay in my local currency?',
    a: 'Prices are shown in USD. At launch we will support cards, bank transfer and mobile money (M-Pesa, MTN MoMo, Airtel Money) with local-currency billing in Nigeria, Kenya, Ghana, South Africa and Egypt first.',
  },
  {
    q: 'Can I cancel or change plans anytime?',
    a: 'Yes — upgrade, downgrade or cancel from your dashboard at any time. Annual plans are refunded pro-rata for unused full months.',
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
            <Sparkles size={16} className="text-yellow-300" />
            Simple pricing, built for African businesses
          </div>
          <h1 className="text-3xl md:text-5xl font-bold">Grow at your own pace</h1>
          <p className="text-blue-100 text-base md:text-lg max-w-2xl mx-auto">
            Start free. Upgrade when you're ready to advertise across Africa's largest
            business growth ecosystem.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full p-1.5 mt-4">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${!annual ? 'bg-white text-blue-700' : 'text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${annual ? 'bg-white text-blue-700' : 'text-white'}`}
            >
              Annual <span className={annual ? 'text-green-600' : 'text-green-300'}>−20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans(annual).map(plan => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? 'shadow-2xl border-2 border-purple-500 md:-mt-4 md:mb-[-1rem]'
                  : 'shadow-lg border border-gray-100'
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-purple-600 text-white text-xs font-bold rounded-full uppercase tracking-wide">
                  Most Popular
                </span>
              )}
              <div className={`w-12 h-12 ${plan.iconBg} rounded-xl flex items-center justify-center mb-4`}>
                <plan.icon size={24} className={plan.iconText} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              <p className="text-sm text-gray-600 mb-4">{plan.tagline}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-gray-500 text-sm">/month{plan.price > 0 && annual ? ', billed annually' : ''}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/waitlist"
                className={`block text-center px-6 py-3 rounded-lg font-medium transition ${
                  plan.highlight
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Placement owners and creative professionals list for free and keep 90% of every booking.
        </p>
      </section>

      {/* Marketplace pricing explainer */}
      <section className="bg-white border-y border-gray-100 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
            Marketplace pricing at a glance
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-6 bg-gray-50 rounded-xl">
              <p className="text-3xl font-bold text-blue-600 mb-2">$110–900<span className="text-base text-gray-500">/day</span></p>
              <h3 className="font-semibold text-gray-900 mb-1">Ad Placements</h3>
              <p className="text-sm text-gray-600">Billboards, digital screens, transit, airports and stadiums — priced per day by location and traffic.</p>
            </div>
            <div className="p-6 bg-gray-50 rounded-xl">
              <p className="text-3xl font-bold text-pink-600 mb-2">$15–3,000<span className="text-base text-gray-500">/project</span></p>
              <h3 className="font-semibold text-gray-900 mb-1">Creative Services</h3>
              <p className="text-sm text-gray-600">Photography, video, design, audio and social — transparent per-project or per-deliverable rates.</p>
            </div>
            <div className="p-6 bg-gray-50 rounded-xl">
              <p className="text-3xl font-bold text-green-600 mb-2">10%<span className="text-base text-gray-500"> fee</span></p>
              <h3 className="font-semibold text-gray-900 mb-1">Secure Bookings</h3>
              <p className="text-sm text-gray-600">One flat platform fee covers verification, escrow-style payments and dispute support. 0% on Pro.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left font-medium text-gray-900"
              >
                {faq.q}
                <ChevronDown
                  size={18}
                  className={`text-gray-500 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openFaq === i && (
                <p className="px-6 pb-5 text-sm text-gray-600">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white py-14">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">Be first in line at launch</h2>
          <p className="text-blue-100">
            Founding members lock in launch pricing for 12 months and get a verified badge free.
          </p>
          <Link
            to="/waitlist"
            className="inline-block px-8 py-4 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition shadow-lg"
          >
            Join the Waitlist
          </Link>
        </div>
      </section>
    </div>
  );
}
