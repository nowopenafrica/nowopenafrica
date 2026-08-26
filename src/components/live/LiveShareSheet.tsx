import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link2, Check, Share2, ImageDown, Loader2, MessageCircle } from 'lucide-react';

import {
  liveShareUrl, liveShareMessage, whatsappShareLink, liveBadge, livePosterUrl,
  type LiveStatus,
} from '../../lib/liveShare';
import { renderLiveStatusCard } from '../../lib/liveStatusCard';
import { canShareFiles } from '../../lib/reelShare';

/**
 * Everything an owner needs to put a broadcast in front of people.
 *
 * Two jobs, and they are genuinely different:
 *
 *  - THE LINK unfurls into a rich card anywhere it is pasted, because /live/:id
 *    is server-rendered HTML (api/live/[id].ts). Chat, a tweet, a Telegram
 *    group, a WhatsApp status link sticker — all the same link.
 *
 *  - THE STATUS CARD is a 9:16 image, because WhatsApp Status and Instagram
 *    Stories render uploaded media and nothing else. There is no meta tag that
 *    makes a live stream play inside a status; what people actually do is post
 *    a picture saying they are live, with the link on it and beside it. So the
 *    card is generated with the broadcast's own poster frame behind it.
 */
interface LiveShareSheetProps {
  streamId: string;
  title: string;
  businessName: string;
  status: LiveStatus;
  /** Falls back behind the status card when no poster frame exists yet. */
  fallbackImage?: string | null;
  scheduledFor?: string | null;
  compact?: boolean;
}

export default function LiveShareSheet({
  streamId, title, businessName, status, fallbackImage, scheduledFor, compact,
}: LiveShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);

  // The deployed origin, not the hardcoded one: a link copied on staging that
  // points at production is a link that shows the wrong stream.
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const input = { streamId, title, businessName, status, scheduledFor, siteUrl };
  const url = liveShareUrl(streamId, siteUrl);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the link and copy it by hand.');
    }
  };

  const shareLink = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      copyLink();
      return;
    }
    try {
      await navigator.share({ title: `${liveBadge(status)} · ${title}`, text: liveShareMessage(input), url });
    } catch (err) {
      // A cancelled sheet is not a failure, and must not silently do something
      // else on the owner's behalf.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast.error('Could not open the share sheet.');
      }
    }
  };

  const statusCard = async () => {
    setBuilding(true);
    try {
      const poster = livePosterUrl(import.meta.env.VITE_SUPABASE_URL || '', streamId);
      // The poster only appears a few seconds into a broadcast, and not at all
      // for a scheduled one — the cover photo carries the card until then.
      const backgroundUrl = status === 'live' ? poster || fallbackImage : fallbackImage;

      const blob = await renderLiveStatusCard({
        badge: liveBadge(status),
        businessName,
        title,
        url: url.replace(/^https?:\/\//, ''),
        backgroundUrl,
      });
      if (!blob) { toast.error('Could not build the status card.'); return; }

      const file = new File([blob], 'nowopen-live-status.png', { type: 'image/png' });
      if (canShareFiles('image/png')) {
        try {
          // Straight into the share sheet, where "WhatsApp → My status" is one
          // more tap. The link rides in the text so it can be pasted as the
          // caption or attached as a link sticker.
          await navigator.share({ files: [file], text: liveShareMessage(input) });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          // Anything else: fall through and save it instead.
        }
      }

      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'nowopen-live-status.png';
      a.click();
      URL.revokeObjectURL(href);
      toast.success('Status card saved — post it and add the link.');
    } finally {
      setBuilding(false);
    }
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-xl text-sm font-semibold transition';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {!compact && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Anywhere you paste this link it opens a preview card with your {status === 'live' ? 'live badge' : 'stream'} on it.
          For WhatsApp Status or Stories, post the card below and put the link on it.
        </p>
      )}

      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-xl bg-gray-100 dark:bg-gray-700 px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200">
          {url}
        </code>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Copy the live link"
          className={`${btn} w-[44px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}
        >
          {copied ? <Check size={16} className="text-green-600 dark:text-green-400" /> : <Link2 size={16} />}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappShareLink(input)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-[#25D366] text-white hover:brightness-95`}
        >
          <MessageCircle size={16} /> WhatsApp
        </a>
        <button type="button" onClick={shareLink} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
          <Share2 size={16} /> Share link
        </button>
        <button
          type="button"
          onClick={statusCard}
          disabled={building}
          className={`${btn} bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-60`}
        >
          {building ? <Loader2 size={16} className="animate-spin" /> : <ImageDown size={16} />}
          Status card
        </button>
      </div>
    </div>
  );
}
