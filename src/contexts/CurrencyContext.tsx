import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  CURRENCIES,
  CURRENCY_CODES,
  detectRegionCurrency,
  loadRates,
  formatUsdAmount,
  currencyInfo,
  CurrencyInfo,
} from '../lib/currency';

const STORAGE_KEY = 'nowopen-currency';

interface CurrencyContextType {
  /** Active display currency code, e.g. 'NGN' */
  currency: string;
  setCurrency: (code: string) => void;
  /** Format a USD amount in the active currency */
  format: (usd: number, opts?: { compact?: boolean }) => string;
  /** Format a USD amount in plain USD (for "billed as" hints) */
  formatUsd: (usd: number) => string;
  /** USD → active currency rate */
  rate: number;
  /** True once real exchange rates are loaded (vs bundled fallbacks) */
  ratesLive: boolean;
  currencies: CurrencyInfo[];
  info: CurrencyInfo;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function getInitialCurrency(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CURRENCY_CODES.includes(saved)) return saved;
  } catch { /* ignore */ }
  return detectRegionCurrency();
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(getInitialCurrency);
  const [rates, setRates] = useState<Record<string, number>>(() =>
    Object.fromEntries(CURRENCIES.map(c => [c.code, c.fallbackRate]))
  );
  const [ratesLive, setRatesLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRates().then(result => {
      if (cancelled) return;
      setRates(result.rates);
      setRatesLive(result.live);
    });
    return () => { cancelled = true; };
  }, []);

  const setCurrency = (code: string) => {
    if (!CURRENCY_CODES.includes(code)) return;
    setCurrencyState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* won't persist */ }
  };

  const value = useMemo<CurrencyContextType>(() => {
    const rate = rates[currency] ?? 1;
    return {
      currency,
      setCurrency,
      format: (usd, opts) => formatUsdAmount(usd, currency, rate, opts),
      formatUsd: (usd) => formatUsdAmount(usd, 'USD', 1),
      rate,
      ratesLive,
      currencies: CURRENCIES,
      info: currencyInfo(currency),
    };
  }, [currency, rates, ratesLive]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
}
