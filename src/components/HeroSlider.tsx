import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const FADE_DURATION = 1500;
const BUCKET = 'hero-videos';

/** Must match the banner text's own CSS transition, or the swap shows through it. */
export const TEXT_FADE_MS = 2000;

interface HeroSliderProps {
  overlayStyle?: React.CSSProperties;
  /**
   * When set, the slider drives the banner text instead of a free-running
   * timer: the text fades out over the clip's final TEXT_FADE_MS, the next clip
   * takes over while it is hidden, and it fades back in once the crossfade is
   * done. The text then never changes mid-clip and clips never swap under
   * visible text — the two were previously independent, so they collided.
   */
  onTextVisibilityChange?: (visible: boolean) => void;
}

export default function HeroSlider({ overlayStyle, onTextVisibilityChange }: HeroSliderProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState<Record<number, boolean>>({});
  const videoRefs = useRef<HTMLVideoElement[]>([]);
  // Guards the once-per-clip fade-out: timeupdate fires several times a second.
  const fadingOut = useRef(false);
  // Held in a ref so changing the callback never restarts a running sequence.
  const notify = useRef(onTextVisibilityChange);
  notify.current = onTextVisibilityChange;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.storage.from(BUCKET).list('', { limit: 10, sortBy: { column: 'name', order: 'asc' } });
      if (!data || data.length === 0) {
        setVideos(['/hero-background.mp4']);
        return;
      }
      const urls = data
        .filter(f => /\.(mp4|webm|ogg)$/i.test(f.name))
        .map(f => supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl);
      setVideos(urls.length > 0 ? urls : ['/hero-background.mp4']);
    };
    load();
  }, []);

  const advance = useCallback(() => {
    setCurrent(prev => (prev + 1) % videos.length);
  }, [videos.length]);

  useEffect(() => {
    videoRefs.current.forEach((vid, idx) => {
      if (!vid) return;
      if (idx === current) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });

    // The incoming clip is under way — bring the text back once the crossfade
    // between the two videos has finished, not before.
    if (!notify.current) return;
    fadingOut.current = false;
    const t = setTimeout(() => notify.current?.(true), FADE_DURATION);
    return () => clearTimeout(t);
  }, [current]);

  /**
   * Start hiding the text while the clip still has TEXT_FADE_MS left to run.
   *
   * Waiting for `ended` would be too late: the fade would play out over a
   * frozen final frame. Pre-empting means the text is already gone at the
   * moment the clips swap, which is the whole point.
   */
  const onTimeUpdate = (idx: number) => {
    if (!notify.current || idx !== current || fadingOut.current) return;
    const vid = videoRefs.current[idx];
    // duration is NaN until metadata loads, and Infinity for a live stream.
    if (!vid || !Number.isFinite(vid.duration) || vid.duration <= 0) return;
    if ((vid.duration - vid.currentTime) * 1000 <= TEXT_FADE_MS) {
      fadingOut.current = true;
      notify.current(false);
    }
  };

  const onCanPlay = (idx: number) => {
    setReady(prev => ({ ...prev, [idx]: true }));
    if (idx === current) {
      videoRefs.current[idx]?.play().catch(() => {});
    }
  };

  const onEnded = () => {
    // With a single clip, advance() computes the same index, React bails out of
    // the state update, the [current] effect never re-runs — and the banner sits
    // on a frozen last frame for the rest of the visit. Replay it directly.
    if (videos.length <= 1) {
      const vid = videoRefs.current[current];
      if (vid) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
      fadingOut.current = false;
      notify.current?.(true);
      return;
    }
    advance();
  };

  if (videos.length === 0) return null;

  return (
    <>
      {videos.map((src, idx) => (
        <video
          key={src}
          ref={el => { videoRefs.current[idx] = el as HTMLVideoElement; }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: idx === current && ready[idx] ? 1 : 0,
            transition: `opacity ${FADE_DURATION}ms ease-in-out`,
          }}
          src={src}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onCanPlay={() => onCanPlay(idx)}
          onTimeUpdate={() => onTimeUpdate(idx)}
          onEnded={onEnded}
          onError={() => {}}
        />
      ))}
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          ...overlayStyle,
          opacity: 1,
        }}
        aria-hidden="true"
      />
      {/* Dots indicator */}
      {videos.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {videos.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                idx === current ? 'bg-white scale-110' : 'bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </>
  );
}
