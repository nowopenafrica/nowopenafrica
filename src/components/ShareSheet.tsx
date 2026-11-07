import { useEffect, useState, type ComponentType } from 'react';
import toast from 'react-hot-toast';
import {
  X, Link2, Check, Share2, MessageCircle, Facebook, Linkedin, Send, Mail,
} from 'lucide-react';

import { XLogo } from './SocialLinks';
import { shareLinks } from '../lib/studio';

/**
 * One share sheet, owned by the page.
 *
 * Every product can be sent to WhatsApp, Facebook, X, LinkedIn, Telegram or
 * email, copied, or handed to the device's own share sheet. It is deliberately
 * a single controlled component the page renders once rather than a modal per
 * card: the page holds what is being shared, and each card only asks it to
 * open. That keeps one definition of the sheet and one place to fix it.
 *
 * The platform targets come from lib/studio's `shareLinks` so the Share Center
 * and this agree on where a link can go.
 */
const BRAND: Record<string, string> = {
  whatsapp: 'bg-[#25D366]',
  facebook: 'bg-[#1877F2]',
  x: 'bg-black',
  linkedin: 'bg-[#0A66C2]',
  telegram: 'bg-[#229ED9]',
  email: 'bg-gray-600',
};

type IconType = ComponentType<{ size?: number | string; className?: string }>;

const ICONS: Record<string, IconType> = {
  whatsapp: MessageCircle,
  facebook: Facebook,
  x: XLogo,
  linkedin: Linkedin,
  telegram: Send,
  email: Mail,
};

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  text?: string;
  /** A short line under the header naming what is being shared. */
  subtitle?: string;
}

export default function ShareSheet({ open, onClose, url, title, text, subtitle }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || !url) return null;

  const message = (text ?? title).trim();
  const links = shareLinks(url, message);
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link - select it and copy by hand.');
    }
  };

  const nativeShare = async () => {
    if (!canNative) {
      copy();
      return;
    }
    try {
      await navigator.share({ title, text: message, url });
      onClose();
    } catch (err) {
      // A dismissed sheet is not a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast.error('Could not open the share sheet.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Share</h2>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-3 flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {canNative && (
            <button
              onClick={nativeShare}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
            >
              <Share2 size={18} /> Share…
            </button>
          )}

          <div className="grid grid-cols-3 gap-2">
            {links.map((l) => {
              const Icon = ICONS[l.key] ?? Share2;
              return (
                <a
                  key={l.key}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <span
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${BRAND[l.key] ?? 'bg-gray-500'}`}
                  >
                    <Icon size={20} />
                  </span>
                  {l.label}
                </a>
              );
            })}
            <button
              onClick={copy}
              className="flex flex-col items-center justify-center gap-1.5 min-h-[76px] rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <span className="w-11 h-11 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-100">
                {copied ? <Check size={20} /> : <Link2 size={20} />}
              </span>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>

          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-700 px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
