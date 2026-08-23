import { useState } from 'react';
import { videoThumbnailSrc } from '../lib/galleryMedia';
import { posterUrlForVideo } from '../lib/reelShare';

interface Props {
  url: string;
  alt?: string;
  className?: string;
  /** Reports the intrinsic size once known, for the orientation filters. */
  onMeasured?: (width: number, height: number) => void;
}

/**
 * Thumbnail for a video reel — a still image wherever one exists.
 *
 * WHY NOT JUST A <video>
 *
 * A `<video preload="metadata">` tile has to open the file and pull enough of it
 * to decode a frame: for a grid of reels that is several megabytes and a decoder
 * per tile before anything is visible, which is what made the gallery slow to
 * settle on a phone. Reels now upload a poster JPEG beside the clip (a few tens
 * of kilobytes), so the grid can be plain `<img loading="lazy" decoding="async">`s — no video is fetched until
 * someone actually opens one.
 *
 * Reels recorded before posters existed have none, so a failed poster load falls
 * back to the old video-frame approach rather than showing a blank tile.
 */
export default function GalleryThumb({ url, alt, className = '', onMeasured }: Props) {
  const poster = posterUrlForVideo(url);
  const [posterFailed, setPosterFailed] = useState(false);

  if (poster && !posterFailed) {
    return (
      <img
        src={poster}
        alt={alt || ''}
        loading="lazy"
        decoding="async"
        className={className}
        onLoad={(e) => onMeasured?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        onError={() => setPosterFailed(true)}
      />
    );
  }

  return (
    <video
      // #t=0.1 seeks so a frame is painted; without it iOS shows black.
      src={videoThumbnailSrc(url)}
      className={className}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => onMeasured?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
      onError={() => {}}
    />
  );
}
