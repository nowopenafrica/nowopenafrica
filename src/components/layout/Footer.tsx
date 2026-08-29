import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import SocialLinks from '../SocialLinks';
import { useT } from '../../contexts/I18nContext';

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
  { to: '/businesses', key: 'footer.discoverBusinesses' },
  { to: '/platform', key: 'footer.industrySystems' },
  { to: '/adverts', key: 'footer.adPlacements' },
  { to: '/media', key: 'footer.creativeServices' },
  { to: '/pricing', key: 'nav.pricing' },
];

const company = [
  { to: '/about', key: 'footer.about' },
  { to: '/founder', key: 'footer.founder' },
  { to: '/os', key: 'nav.os' },
  { to: '/contact', key: 'footer.contact' },
];

const getStarted = [
  { to: '/forms', key: 'nav.join' },
  { to: '/waitlist', key: 'nav.africaNowOpen' },
  { to: '/register', key: 'footer.createAccount' },
  { to: '/login', key: 'nav.signIn' },
];

/** 32px rows: above the WCAG 2.5.8 AA minimum, without stacking like buttons. */
const linkClass = 'inline-flex items-center min-h-[32px] hover:text-white transition';

function LinkColumn({ titleKey, links }: { titleKey: string; links: { to: string; key: string }[] }) {
  const t = useT();
  return (
    <div>
      <h3 className="text-white font-bold text-sm mb-2">{t(titleKey)}</h3>
      <ul className="text-xs">
        {links.map(link => (
          <li key={link.to}>
            <Link to={link.to} className={linkClass}>{t(link.key)}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const t = useT();

  return (
    <footer className="bg-gray-900 text-gray-300 mt-12">
      <div className="site-container py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 mb-6">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-white font-bold text-sm mb-2">NowOpen Africa</h3>
            <p className="text-xs leading-relaxed text-gray-400 mb-3">{t('footer.blurb')}</p>

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
                <span>{t('footer.location')}</span>
              </p>
            </div>

            <SocialLinks />
          </div>

          <LinkColumn titleKey="footer.explore" links={explore} />
          <LinkColumn titleKey="footer.company" links={company} />
          <LinkColumn titleKey="footer.getStarted" links={getStarted} />
        </div>

        <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-center text-xs text-gray-400">
            {t('footer.rights', { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-1 text-xs">
            {[
              { to: '/terms', key: 'footer.terms' },
              { to: '/privacy', key: 'footer.privacy' },
              { to: '/contact', key: 'footer.contact' },
            ].map(l => (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center min-h-[32px] px-2 text-gray-400 hover:text-white transition"
              >
                {t(l.key)}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
