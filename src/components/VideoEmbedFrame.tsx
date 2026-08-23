import { ExternalLink } from 'lucide-react';
import { parseVideoEmbed } from '../lib/videoEmbeds';

interface Props {
  url: string;
  /** Show the platform name + a link to the original. Off for small tiles. */
  showAttribution?: boolean;
  className?: string;
  title?: string;
  /** Fill the parent's height instead of using the platform's aspect ratio. */
  fill?: boolean;
}

/**
 * Plays a video that lives on another platform, in that platform's own iframe.
 *
 * Deliberately not a `<video>`: Instagram, TikTok and YouTube don't expose the
 * underlying file, so the official embed is the only way to play one — and it
 * keeps the creator's view count and attribution intact rather than re-hosting
 * their work. The hosts these iframes load from are allow-listed in
 * vercel.json's `frame-src`; without that they are blocked in production.
 */
/** TikTok and Instagram Reels are shot vertically; the rest are widescreen. */
const ASPECT: Record<string, string> = {
  tiktok: 'aspect-[9/16]',
  instagram: 'aspect-[9/16]',
  youtube: 'aspect-video',
  vimeo: 'aspect-video',
  facebook: 'aspect-video',
};

export default function VideoEmbedFrame({ url, showAttribution = true, className = '', title, fill = false }: Props) {
  const embed = parseVideoEmbed(url);
  if (!embed) return null;

  // `fill` is for grid tiles that already impose their own shape; otherwise the
  // frame takes the platform's natural aspect so the player isn't letterboxed.
  const shape = fill ? 'h-full' : ASPECT[embed.platform] || 'aspect-video';

  return (
    <div className={className}>
      <div className={`relative w-full ${shape} bg-black overflow-hidden rounded-lg`}>
        <iframe
          src={embed.embedUrl}
          title={title || `${embed.label} video`}
          loading="lazy"
          // Only what a player needs. No same-origin: an embedded page has no
          // business reaching into this document.
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
      {showAttribution && (
        <a
          href={embed.originalUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <ExternalLink size={11} /> Watch on {embed.label}
        </a>
      )}
    </div>
  );
}
