import { Globe } from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

interface CurrencySelectorProps {
  className?: string;
}

export default function CurrencySelector({ className = '' }: CurrencySelectorProps) {
  const { currency, setCurrency, currencies, ratesLive } = useCurrency();

  return (
    <label
      className={`relative inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 ${className}`}
      title={ratesLive ? 'Prices converted at live exchange rates' : 'Prices converted at approximate rates'}
    >
      <Globe size={15} className="flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="appearance-none bg-transparent pr-1 py-1 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
      >
        {currencies.map(c => (
          <option key={c.code} value={c.code} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            {c.code} — {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
