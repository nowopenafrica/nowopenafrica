import { Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-white font-bold text-sm mb-4">About NowOpen</h3>
            <p className="text-xs leading-relaxed">
              The Operating System for Business Growth in Africa.
            </p>
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Quick Links</h3>
            <ul className="space-y-2 text-xs">
              <li><a href="/" className="hover:text-white transition">Home</a></li>
              <li><a href="/businesses" className="hover:text-white transition">Businesses</a></li>
              <li><a href="/media" className="hover:text-white transition">Media Services</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Contact</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Mail size={14} />
                <span>hello@nowopenafrica.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} />
                <span>+234 (708) 154-7726</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold text-sm mb-4">Location</h3>
            <div className="flex items-start gap-2 text-xs">
              <MapPin size={14} className="mt-0.5 flex-shrink-0" />
              <span>Africa</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-8">
          <p className="text-center text-xs text-gray-400">
            &copy; 2026 NowOpen Africa (AEY Inc.). All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
