import type { ComponentType } from 'react';
import { Facebook, Instagram, Youtube, Linkedin } from 'lucide-react';

// lucide-react ships the old Twitter bird but no X wordmark and no TikTok
// note — small hand-rolled SVGs, sized/styled the same way as lucide icons
// (size + className props) so they drop into the same icon row.
export function XLogo({ size = 20, className = '' }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TikTokLogo({ size = 20, className = '' }: { size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82c-.9-.98-1.4-2.26-1.4-3.57h-3.13v13.6c0 1.55-1.26 2.81-2.81 2.81a2.81 2.81 0 0 1 0-5.63c.3 0 .58.05.85.13V9.85a5.94 5.94 0 0 0-.85-.06 5.94 5.94 0 1 0 5.94 5.94V8.4a8.4 8.4 0 0 0 4.9 1.57V6.84c-1.15 0-2.24-.36-3.13-.98a5.87 5.87 0 0 1-.37-.04z" />
    </svg>
  );
}

export const SOCIAL_LINKS: { label: string; href: string; Icon: ComponentType<{ size?: number | string; className?: string }> }[] = [
  { label: 'Facebook', href: 'https://facebook.com/nowopenafrica', Icon: Facebook },
  { label: 'Instagram', href: 'https://instagram.com/nowopenafrica', Icon: Instagram },
  { label: 'X', href: 'https://x.com/nowopenafrica', Icon: XLogo },
  { label: 'TikTok', href: 'https://tiktok.com/@nowopenafrica', Icon: TikTokLogo },
  { label: 'YouTube', href: 'https://youtube.com/@nowopenafrica', Icon: Youtube },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/nowopenafrica', Icon: Linkedin },
];

export default function SocialLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {SOCIAL_LINKS.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`NowOpen Africa on ${label}`}
          title={`@nowopenafrica on ${label}`}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 hover:-translate-y-0.5"
        >
          <Icon size={16} />
        </a>
      ))}
    </div>
  );
}
