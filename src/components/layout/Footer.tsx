import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import SocialLinks from '../SocialLinks';

// Compact by design.
//
// This footer was 633px — 13% of the homepage. Most of that was my own doing: a
// touch-target pass put min-h-[44px] on every link, and 44px plus an 8px gap is
// 52px per row, so the eight-item column alone ran to 416px.
//
// 44px is the WCAG 2.5.8 AAA ideal. The AA requirement is 24px, and a dense list
// of text links is exactly where the AAA figure stops being sensible — it turns a
// scannable column into a scroll. These rows are 32px: a third larger than the AA
// minimum, still an easy thumb target, and short enough that a column reads as a
// list rather than a stack of buttons.
//
// The columns were also lopsided — 8 / 5 / 2, with a two-item orphan. Contact
// details now sit under the brand blurb where they read naturally, and the long
// column is split into Company and Get Started, giving 5 / 4 / 4.

const explore = [
  { to: '/businesses', label: 'Discover Businesses' },
  { to: '/platform', label: 'Industry Systems' },
  { to: '/adverts', label: 'Ad Placements' },
  { to: '/media', label: 'Creative Services' },
  { to: '/pricing', label: 'Pricing' },
];

const company = [
  { to: '/about', label: 'About Us' },
  { to: '/founder', label: 'Meet the Founder' },
  { to: '/os', label: 'The NowOpen OS' },
  { to: '/contact', label: 'Contact' },
];

const getStarted = [
  { to: '/forms', label: 'Join NowOpen' },
  { to: '/waitlist', label: 'Africa is NowOpen' },
  { to: '/register', label: 'Create an Account' },
  { to: '/login', label: 'Sign In' },
];

/** 32px rows: above the WCAG 2.5.8 AA minimum, without stacking like buttons. */
const linkClass = 'inline-flex items-center min-h-[32px] hover:text-white transition';

function LinkColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
      <ul className="text-xs">
        {links.map(link => (
          <li key={link.to}>
            <Link to={link.to} className={linkClass}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 mb-6">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-white font-bold text-sm mb-2">NowOpen Africa</h3>
            <p className="text-xs leading-relaxed text-gray-400 mb-3">
              The Operating System for Business Growth in Africa — helping businesses
              get discovered, advertise effectively, and access creative services
              from one ecosystem.
            </p>

            {/* Contact sits here rather than in its own column: two items could
                never fill one, and these read better beside the brand. */}
            <div className="text-xs mb-3">
              <a href="mailto:hello@nowopenafrica.com" className="flex items-center min-h-[32px] gap-2 hover:text-white transition">
                <Mail size={13} className="flex-shrink-0" />
                <span>hello@nowopenafrica.com</span>
              </a>
              <a href="tel:+2347081547726" className="flex items-center min-h-[32px] gap-2 hover:text-white transition">
                <Phone size={13} className="flex-shrink-0" />
                <span>+234 (708) 154-7726</span>
              </a>
              <p className="flex items-start gap-2 text-gray-400 pt-1.5">
                <MapPin size={13} className="mt-0.5 flex-shrink-0" />
                <span>Lagos, Nigeria · Serving 20+ African markets</span>
              </p>
            </div>

            <SocialLinks />
          </div>

          <LinkColumn title="Explore" links={explore} />
          <LinkColumn title="Company" links={company} />
          <LinkColumn title="Get Started" links={getStarted} />
        </div>

        <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} NowOpen Africa (AEY Inc.). All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs">
            {[
              { to: '/terms', label: 'Terms' },
              { to: '/privacy', label: 'Privacy' },
              { to: '/contact', label: 'Contact' },
            ].map(l => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center min-h-[32px] px-2 text-gray-400 hover:text-white transition"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
