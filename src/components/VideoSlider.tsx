import { useEffect, useRef, useState } from 'react';

interface VideoSliderProps {
  videos?: string[];
  fallbackColor?: string;
}

export function VideoSlider({ videos = [], fallbackColor = 'from-blue-600 to-purple-600' }: VideoSliderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || videos.length === 0) {
      setVideoError(true);
      return;
    }

    setVideoError(false);
    setIsLoaded(false);

    video.src = videos[currentVideoIndex];
    video.load();

    const handleLoadedData = () => {
      setIsLoaded(true);
      video.play().catch(() => {
        setVideoError(true);
      });
    };

    const handleError = () => {
      setVideoError(true);
    };

    const handleEnded = () => {
      const nextIndex = (currentVideoIndex + 1) % videos.length;
      setCurrentVideoIndex(nextIndex);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.removeEventListener('ended', handleEnded);
    };
  }, [currentVideoIndex, videos]);

  if (videos.length === 0 || videoError) {
    return (
      <div className={`w-full h-[400px] max-h-[400px] bg-gradient-to-br ${fallbackColor} flex items-center justify-center`}>
        <div className="text-center text-white px-4">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Discover African Businesses</h2>
          <p className="text-lg md:text-xl max-w-2xl mx-auto">
            Your gateway to discovering and connecting with African businesses, services, and opportunities
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] max-h-[400px] overflow-hidden bg-gray-900">
      {!isLoaded && (
        <div className={`absolute inset-0 bg-gradient-to-br ${fallbackColor} flex items-center justify-center`}>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
      )}
      
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        style={{ display: isLoaded ? 'block' : 'none' }}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      
      <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-2">
        {videos.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentVideoIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentVideoIndex ? 'bg-white w-6' : 'bg-white/50'
            }`}
            aria-label={`Go to video ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
