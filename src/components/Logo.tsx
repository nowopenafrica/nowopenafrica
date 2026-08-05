// Full-spectrum wheel; the first and last stop match so the loop is seamless
const WHEEL =
  'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f97316, #eab308, #22c55e, #3b82f6)';

export default function Logo() {
  return (
    <div className="flex items-center space-x-2">
      {/* Rotating, glowing color-wheel brand mark (matches the favicon) */}
      <div className="relative w-6 h-6" aria-hidden="true">
        {/* Glow halo — a blurred copy of the wheel spinning behind it */}
        <div
          className="absolute inset-0 rounded-full blur-[5px] opacity-70 animate-[spin_4s_linear_infinite] motion-reduce:animate-none"
          style={{ background: WHEEL }}
        />
        {/* The wheel itself */}
        <div
          className="absolute inset-0 rounded-full animate-[spin_4s_linear_infinite] motion-reduce:animate-none"
          style={{ background: WHEEL }}
        />
        {/* Hub matches the navbar surface so the wheel reads as a ring */}
        <div className="absolute inset-1 rounded-full bg-white dark:bg-gray-800" />
      </div>
      <div className="text-lg font-bold">
        <span className="text-blue-600 dark:text-blue-400">NOWOPEN</span>
        <span className="text-gray-600 dark:text-gray-400"> AFRICA</span>
      </div>
    </div>
  );
}
