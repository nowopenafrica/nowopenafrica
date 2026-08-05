// The NowOpen Africa brand mark — a glowing full-spectrum colour wheel, matching
// the animated nav logo and favicon. Self-contained (inline styles, no external
// image) so it rasterises cleanly when a card/flyer is exported to PNG.
const WHEEL =
  'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f97316, #eab308, #22c55e, #3b82f6)';

export default function NowOpenMark({
  size = 28,
  glow = true,
  wordmark = false,
  className = '',
}: {
  size?: number;
  glow?: boolean;
  wordmark?: boolean;
  className?: string;
}) {
  const hub = Math.max(2, Math.round(size * 0.17));
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
        {glow && (
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: WHEEL, filter: `blur(${Math.round(size * 0.18)}px)`, opacity: 0.75 }}
          />
        )}
        <div className="absolute inset-0 rounded-full" style={{ background: WHEEL }} />
        <div className="absolute rounded-full bg-white" style={{ inset: hub }} />
      </div>
      {wordmark && (
        <span className="font-bold leading-none" style={{ fontSize: Math.round(size * 0.5) }}>
          <span style={{ color: '#2563eb' }}>NowOpen</span>
        </span>
      )}
    </div>
  );
}
