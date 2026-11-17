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
  /**
   * Cover/banner playback: muted, looping, and autoplaying where the host
   * allows it, with no pointer targets at all — a hovered YouTube or Vimeo
   * player paints its own chrome (title, watch-later, play/pause) over the
   * cover, and an iframe cannot be told to stop except by not receiving the
   * pointer. Off by default so a gallery player still behaves like a player.
   */
  ambient?: boolean;
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

export default function VideoEmbedFrame({ url, showAttribution = true, className = '', title, fill = false, ambient = false }: Props) {
  const embed = parseVideoEmbed(url, { ambient });
  if (!embed) return null;

  // `fill` is for grid tiles that already impose their own shape; otherwise the
  // frame takes the platform's natural aspect so the player isn't letterboxed.
  const shape = fill ? 'h-full' : ASPECT[embed.platform] || 'aspect-video';
  const playerAspect = ASPECT[embed.platform] || 'aspect-video';

  return (
    <div className={className}>
      <div className={`relative w-full ${shape} bg-black overflow-hidden rounded-lg`}>
        {/*
          * Ambient cover: the player keeps its own aspect ratio, is scaled past
          * the box and clipped — the same geometry as `object-fit: cover`.
          *
          * Pinned to `inset-0` instead, a 16:9 player inside a letterbox-shaped
          * banner draws its own black bars down both sides. That is what "the
          * video does not fill the banner" looks like: the frame fills, the
          * video inside it does not, and no URL parameter changes that.
          */}
        <iframe
          src={embed.embedUrl}
          title={title || `${embed.label} video`}
          loading={ambient ? 'eager' : 'lazy'}
          // Only what a player needs. No same-origin: an embedded page has no
          // business reaching into this document.
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen={!ambient}
          tabIndex={ambient ? -1 : undefined}
          className={
            ambient
              ? `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full ${playerAspect} max-w-none border-0 pointer-events-none`
              : 'absolute inset-0 w-full h-full border-0'
          }
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
