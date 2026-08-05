import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const FADE_DURATION = 1500;
const BUCKET = 'hero-videos';

interface HeroSliderProps {
  overlayStyle?: React.CSSProperties;
}

export default function HeroSlider({ overlayStyle }: HeroSliderProps) {
  const [videos, setVideos] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState<Record<number, boolean>>({});
  const videoRefs = useRef<HTMLVideoElement[]>([]);

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
  }, [current]);

  const onCanPlay = (idx: number) => {
    setReady(prev => ({ ...prev, [idx]: true }));
    if (idx === current) {
      videoRefs.current[idx]?.play().catch(() => {});
    }
  };

  const onEnded = () => advance();

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
