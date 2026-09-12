import { useState } from 'react';
import { Play } from 'lucide-react';

import { embedThumbnailUrl, parseVideoEmbed } from '../lib/videoEmbeds';

interface Props {
  url: string;
  alt?: string;
}

/**
 * Tile for a gallery item that is a platform link rather than a media file.
 *
 * THE DEFECT THIS FIXES
 *
 * All four YouTube reels in the gallery rendered a grey rectangle with a play
 * icon and the word "YouTube". They are the only reels a business had bothered
 * to caption — "RESET Logo Reveal", "NowOpen Africa (Ad Video)", "REX AI
 * Promo" — and the grid showed none of them.
 *
 * The reason was structural, not a bug in the placeholder: an embed has no
 * `-poster.jpg` beside it (there is no file to put one beside) and is not a
 * video URL, so both of GalleryThumb's strategies miss it.
 *
 * WHY A STILL IMAGE AND NOT AN IFRAME
 *
 * An iframe per tile loads a full player — script, styles and a network
 * conversation with the platform — for a grid the visitor has not asked to
 * play yet. On the phones this audience uses that is what made the gallery
 * slow to settle. The real player still opens in the lightbox on tap.
 *
 * WHAT HAPPENS FOR THE PLATFORMS WITHOUT A DERIVABLE STILL
 *
 * Vimeo, TikTok, Instagram and Facebook need an oEmbed or Graph call to
 * resolve a thumbnail. Rather than guess a URL that 404s, those keep the
 * labelled placeholder — "TikTok" under a play icon is honest about not having
 * the picture, and a broken image is not.
 */
export default function EmbedThumb({ url, alt }: Props) {
  const thumb = embedThumbnailUrl(url);
  const [failed, setFailed] = useState(false);
  const label = parseVideoEmbed(url)?.label;

  if (thumb && !failed) {
    return (
      <>
        <img
          src={thumb}
          alt={alt || ''}
          loading="lazy"
          decoding="async"
          /* The still is served by the platform, not by us. */
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          /*
           * A thumbnail can be missing even when the id is right — a deleted
           * or private video still parses. Falling back to the placeholder
           * beats a broken image, which reads as NowOpen being broken rather
           * than the video being gone.
           */
          onError={() => setFailed(true)}
        />
        {/* Play affordance and provenance, over the still. */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={18} className="text-gray-900 ml-0.5" />
          </div>
        </div>
        {label && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-semibold uppercase tracking-wide text-white pointer-events-none">
            {label}
          </span>
        )}
      </>
    );
  }

  // No derivable still, or it failed to load.
  return (
    <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center gap-2">
      <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
        <Play size={18} className="text-gray-900 ml-0.5" />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-300">
        {label}
      </span>
    </div>
  );
}
