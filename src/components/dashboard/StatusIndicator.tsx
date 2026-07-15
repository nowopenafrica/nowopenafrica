import { Clock } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'open' | 'closed';
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${
        status === 'open' ? 'bg-green-500' : 'bg-gray-400'
      }`} />
      <span className={`font-medium ${
        status === 'open' ? 'text-green-600' : 'text-gray-600'
      }`}>
        {status === 'open' ? 'Open Now' : 'Currently Closed'}
      </span>
      <Clock size={14} className="text-gray-400" />
      <span className="text-gray-500">
        {status === 'open' ? 'Open 24/7' : 'Closed for the day'}
      </span>
    </div>
  );
}
