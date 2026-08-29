import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadHeroSettings } from '../lib/heroSettings';
import { heroPlaylist, EMBED_SLIDE_SECONDS, type HeroSlide } from '../lib/heroSlides';

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
  const [videos, setVideos] = useState<HeroSlide[]>([]);
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
      // Uploaded clips and URL slides are loaded together: a banner made only of
      // YouTube links is a legitimate setup, so an empty bucket must not fall
      // back to the packaged clip and hide them.
      const [listed, settings] = await Promise.all([
        supabase.storage.from(BUCKET).list('', { limit: 10, sortBy: { column: 'name', order: 'asc' } }),
        loadHeroSettings(),
      ]);
      const uploads = (listed.data ?? [])
        .filter(f => /\.(mp4|webm|ogg)$/i.test(f.name))
        .map(f => supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl);

      const playlist = heroPlaylist(uploads, settings.urlSlides);
      setVideos(playlist.length > 0
        ? playlist
        : heroPlaylist(['/hero-background.mp4'], []));
    };
    load();
  }, []);

  const advance = useCallback(() => {
    setCurrent(prev => (prev + 1) % videos.length);
  }, [videos.length]);

  /**
   * Manual navigation.
   *
   * Wraps in both directions, so Previous on the first slide goes to the last
   * rather than doing nothing — a dead arrow reads as broken.
   *
   * No separate timer handling is needed: the auto-advance timers live in an
   * effect keyed on `current`, so moving by hand tears them down and starts the
   * new slide's turn from the beginning. Without that, somebody who pressed
   * Next could be moved on again a moment later by the outgoing slide's timer.
   */
  const goBy = useCallback((step: -1 | 1) => {
    setCurrent(prev => (prev + step + videos.length) % videos.length);
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
    fadingOut.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (notify.current) timers.push(setTimeout(() => notify.current?.(true), FADE_DURATION));

    // An embed reports nothing — no canplay, no timeupdate, no ended. Reading
    // playback out of a YouTube iframe needs their IFrame API, and script-src
    // does not allow youtube.com, so that script would simply be blocked. A
    // timer is the honest alternative: the slide gets a fixed turn.
    const slide = videos[current];
    if (slide?.kind === 'embed' && videos.length > 1) {
      const ms = EMBED_SLIDE_SECONDS * 1000;
      if (notify.current) timers.push(setTimeout(() => { fadingOut.current = true; notify.current?.(false); }, Math.max(0, ms - TEXT_FADE_MS)));
      timers.push(setTimeout(advance, ms));
    }
    return () => timers.forEach(clearTimeout);
  }, [current, videos, advance]);

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
      {videos.map((slide, idx) => {
        const visible = idx === current;
        const fade = { transition: `opacity ${FADE_DURATION}ms ease-in-out` } as const;

        // An embed cannot report canplay, so it is treated as ready as soon as
        // it is its turn — otherwise it would never fade in at all.
        if (slide.kind === 'embed') {
          return (
            <div
              key={slide.id}
              className="absolute inset-0 overflow-hidden"
              style={{ opacity: visible ? 1 : 0, ...fade }}
              aria-hidden="true"
            >
              {/* Only the visible embed is mounted. An off-screen YouTube iframe
                  still downloads and decodes, which on a phone means paying for
                  video nobody is watching. */}
              {visible && (
                <iframe
                  src={slide.playbackUrl}
                  title={slide.title || 'Background video'}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  // object-fit does not apply to an iframe, so cover is done
                  // with aspect-ratio plus minimums: 16:9 is preserved, and the
                  // two minimums force it to be at least as large as the banner
                  // in both axes. Overflow is clipped by the parent, which also
                  // takes YouTube's title bar and logo out of shot.
                  //
                  // Sized against the CONTAINER, not the viewport. The usual
                  // 177.78vh/56.25vw trick assumes the box IS the viewport; for
                  // a 70vh banner it built a 2542px-wide iframe to fill 1435px,
                  // which is a lot of video for a phone to decode and throw away.
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none border-0"
                  style={{ width: 'auto', height: 'auto', aspectRatio: '16 / 9', minWidth: '100%', minHeight: '100%' }}
                />
              )}
            </div>
          );
        }

        return (
          <video
            key={slide.id}
            ref={el => { videoRefs.current[idx] = el as HTMLVideoElement; }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: visible && ready[idx] ? 1 : 0, ...fade }}
            src={slide.playbackUrl}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onCanPlay={() => onCanPlay(idx)}
            onTimeUpdate={() => onTimeUpdate(idx)}
            onEnded={onEnded}
            onError={() => {}}
          />
        );
      })}
      {/* Gradient overlay */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          ...overlayStyle,
          opacity: 1,
        }}
        aria-hidden="true"
      />
      {/* Previous / next.
          Only with more than one slide, and sized as real 44px targets rather
          than the decorative arrows a hero usually gets — these are the control
          somebody reaches for when a banner moved on before they finished
          reading it. Sized in px, not w-11: this app's root font is 15px, so
          the rem-based utility renders 41px and quietly misses the target. */}
      {videos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => goBy(-1)}
            aria-label="Previous banner"
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-[44px] h-[44px] rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            onClick={() => goBy(1)}
            aria-label="Next banner"
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-[44px] h-[44px] rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {/* Dots indicator */}
      {videos.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {videos.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              aria-label={`Banner ${idx + 1} of ${videos.length}`}
              aria-current={idx === current ? 'true' : undefined}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                idx === current ? 'bg-white scale-110' : 'bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
