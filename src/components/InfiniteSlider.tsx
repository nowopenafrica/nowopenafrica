import { useState, useRef, useEffect, useCallback } from 'react';
import { Star, DollarSign, Users, MapPin, BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../contexts/CurrencyContext';
import BusinessStatusBadge from './BusinessStatusBadge';
import { legacyStatusToLive } from '../lib/businessStatus';

interface Card {
  id: string;
  /** Explicit link target; falls back to `/${linkBase}/${id}` */
  href?: string;
  title: string;
  description: string;
  image_url: string;
  category?: string;
  rating?: number;
  status?: 'open' | 'closed' | 'active';
  price?: number;
  location?: string;
  phone?: string;
  website?: string;
  reach?: number;
  verified?: boolean;
  type?: 'advert' | 'business' | 'media';
}

interface InfiniteSliderProps {
  cards: Card[];
  title?: string;
  category?: string;
  onCardClick?: (card: Card) => void;
  linkBase?: string;
}

export function InfiniteSlider({ cards, onCardClick, linkBase }: InfiniteSliderProps) {
  const { format } = useCurrency();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  // Read pause state through a ref so pausing doesn't restart the animation
  // effect (which used to snap the slider back to the start on every hover).
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Duplicate cards for seamless infinite scroll
  const duplicatedCards = [...cards, ...cards, ...cards];

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer || cards.length === 0) return;

    const SPEED = 15; // scroll speed in px per second — lower is slower
    let animationFrameId: number;
    let currentScroll = scrollContainer.scrollLeft;
    let lastTime = performance.now();

    // Time-based animation so the speed is identical on every display
    // refresh rate (a px-per-frame step runs 4x faster on a 240Hz screen).
    const animate = (now: number) => {
      const delta = Math.min(now - lastTime, 100);
      lastTime = now;

      if (!isPausedRef.current) {
        // Measured every frame — card widths change as images load in
        const singleSetWidth = scrollContainer.scrollWidth / 3;
        currentScroll += (SPEED * delta) / 1000;

        // Reset to create infinite loop effect
        if (singleSetWidth > 0 && currentScroll >= singleSetWidth) {
          currentScroll = 0;
          scrollContainer.scrollLeft = 0;
        } else {
          scrollContainer.scrollLeft = currentScroll;
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [cards.length]);

  const handleCardClick = useCallback((card: Card) => {
    if (onCardClick) {
      onCardClick(card);
    }
  }, [onCardClick]);

  const getLinkPath = (card: Card) => {
    if (card.href) {
      return card.href;
    }
    if (linkBase) {
      return `/${linkBase}/${card.id}`;
    }
    // Fallback based on card type
    switch (card.type) {
      case 'advert':
        return `/adverts/${card.id}`;
      case 'business':
        return `/businesses/${card.id}`;
      case 'media':
        return `/media/${card.id}`;
      default:
        return `/${card.id}`;
    }
  };

  const renderCard = (card: Card, index: number) => (
    <Link
      key={`${card.id}-${index}`}
      to={getLinkPath(card)}
      className="flex-shrink-0 w-[calc(12.5%-12px)] min-w-[180px] bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 cursor-pointer block"
      onClick={() => handleCardClick(card)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="h-24 overflow-hidden">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600" />
        )}
      </div>
      <div className="p-2.5">
        {card.category && (
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mb-0.5 uppercase tracking-wide">
            {card.category}
          </p>
        )}
        <h3 className="font-semibold text-gray-900 dark:text-white text-xs mb-1 line-clamp-2 leading-tight">
          {card.title}
          {card.verified && (
            <BadgeCheck size={12} className="inline-block align-text-bottom ml-1 text-blue-500 fill-blue-100" aria-label="Verified" />
          )}
        </h3>
        {card.description && (
          <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2 mb-1.5 leading-snug">
            {card.description}
          </p>
        )}
        {card.status && (
          <div className="mb-1.5">
            <BusinessStatusBadge status={legacyStatusToLive(card.status) ?? 'closed'} category={card.category} compact />
          </div>
        )}
        {card.rating !== undefined && card.rating > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Star size={10} className="fill-yellow-400 text-yellow-400" />
            <span className="text-[10px] font-medium text-gray-900 dark:text-white">
              {card.rating.toFixed(1)}
            </span>
          </div>
        )}
        {card.price !== undefined && card.price > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <DollarSign size={10} className="text-green-600 dark:text-green-400" />
            <span className="text-[10px] font-bold text-gray-900 dark:text-white">
              {format(card.price)}
            </span>
          </div>
        )}
        {card.reach !== undefined && card.reach > 0 && (
          <div className="flex items-center gap-1 mb-1.5">
            <Users size={10} className="text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] font-medium text-gray-900 dark:text-white">
              {card.reach.toLocaleString()}
            </span>
          </div>
        )}
        {card.location && (
          <div className="flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400">
            <MapPin size={10} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
            <span className="line-clamp-1">{card.location}</span>
          </div>
        )}
      </div>
    </Link>
  );

  return (
    <div className="w-full">
      <div
        className="w-full overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-hidden"
          style={{ scrollBehavior: 'auto' }}
        >
          {duplicatedCards.map((card, index) => renderCard(card, index))}
        </div>
      </div>
    </div>
  );
}
