import { useState, useEffect } from 'react';

export default function Logo() {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center space-x-2">
      <div className="relative w-6 h-6">
        <div className={`absolute inset-0 border-4 border-blue-600 border-t-blue-200 rounded-full animate-spin ${isAnimating ? 'opacity-100' : 'opacity-0'} animate-color-wheel`} />
      </div>
      <div className="text-lg font-bold">
        <span className="text-blue-600">NOWOPEN</span>
        <span className="text-gray-600"> AFRICA</span>
      </div>
    </div>
  );
}
