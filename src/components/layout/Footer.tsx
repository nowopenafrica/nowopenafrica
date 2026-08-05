import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import SocialLinks from '../SocialLinks';

const explore = [
  { to: '/businesses', label: 'Discover Businesses' },
  { to: '/platform', label: 'Industry Systems' },
  { to: '/adverts', label: 'Ad Placements' },
  { to: '/media', label: 'Creative Services' },
  { to: '/pricing', label: 'Pricing' },
];

const company = [
  { to: '/about', label: 'About Us' },
  { to: '/waitlist', label: 'Africa is NowOpen' },
  { to: '/founder', label: 'Meet the Founder' },
  { to: '/contact', label: 'Contact' },
  { to: '/register', label: 'Create an Account' },
  { to: '/login', label: 'Sign In' },
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="text-white font-bold text-sm mb-4">NowOpen Africa</h3>
            <p className="text-xs leading-relaxed text-gray-400 mb-4">
              The Operating System for Business Growth in Africa — helping 100M+
              businesses get discovered, advertise effectively, and access
              creative services from one ecosystem.
            </p>
            <SocialLinks />
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Explore</h3>
            <ul className="space-y-2 text-xs">
              {explore.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-white transition">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Get Started</h3>
            <ul className="space-y-2 text-xs">
              {company.map(link => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-white transition">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Contact</h3>
            <div className="space-y-2 text-xs">
              <a
                href="mailto:hello@nowopenafrica.com"
                className="flex items-center gap-2 hover:text-white transition"
              >
                <Mail size={14} />
                <span>hello@nowopenafrica.com</span>
              </a>
              <a
                href="tel:+2347081547726"
                className="flex items-center gap-2 hover:text-white transition"
              >
                <Phone size={14} />
                <span>+234 (708) 154-7726</span>
              </a>
              <div className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                <span>Lagos, Nigeria · Serving 20+ African markets</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} NowOpen Africa (AEY Inc.). All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/terms" className="text-gray-400 hover:text-white transition">Terms</Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white transition">Privacy</Link>
            <Link to="/contact" className="text-gray-400 hover:text-white transition">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
