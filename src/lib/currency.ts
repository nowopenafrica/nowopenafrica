// Multi-currency engine.
// All prices in the database and sample data are stored in USD; display
// values are converted with live exchange rates (fetched once and cached),
// falling back to bundled approximate rates when the rates API is
// unreachable, so prices always render.

export interface CurrencyInfo {
  code: string;
  name: string;
  countries: string;
  locale: string;
  /** Approximate USD→currency rate used only until live rates load */
  fallbackRate: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', countries: 'International', locale: 'en-US', fallbackRate: 1 },
  { code: 'NGN', name: 'Nigerian Naira', countries: 'Nigeria', locale: 'en-NG', fallbackRate: 1500 },
  { code: 'KES', name: 'Kenyan Shilling', countries: 'Kenya', locale: 'en-KE', fallbackRate: 129 },
  { code: 'GHS', name: 'Ghanaian Cedi', countries: 'Ghana', locale: 'en-GH', fallbackRate: 15.6 },
  { code: 'ZAR', name: 'South African Rand', countries: 'South Africa', locale: 'en-ZA', fallbackRate: 18.2 },
  { code: 'EGP', name: 'Egyptian Pound', countries: 'Egypt', locale: 'en-EG', fallbackRate: 50 },
  { code: 'TZS', name: 'Tanzanian Shilling', countries: 'Tanzania', locale: 'en-TZ', fallbackRate: 2650 },
  { code: 'UGX', name: 'Ugandan Shilling', countries: 'Uganda', locale: 'en-UG', fallbackRate: 3720 },
  { code: 'XOF', name: 'West African CFA', countries: "Senegal, Côte d'Ivoire +6", locale: 'fr-SN', fallbackRate: 600 },
  { code: 'RWF', name: 'Rwandan Franc', countries: 'Rwanda', locale: 'en-RW', fallbackRate: 1420 },
  { code: 'ETB', name: 'Ethiopian Birr', countries: 'Ethiopia', locale: 'en-ET', fallbackRate: 135 },
  { code: 'MAD', name: 'Moroccan Dirham', countries: 'Morocco', locale: 'fr-MA', fallbackRate: 10.1 },
];

export const CURRENCY_CODES = CURRENCIES.map(c => c.code);

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0];
}

// IANA timezone → default currency, so visitors see local prices immediately.
const TIMEZONE_CURRENCY: Record<string, string> = {
  'Africa/Lagos': 'NGN',
  'Africa/Nairobi': 'KES',
  'Africa/Accra': 'GHS',
  'Africa/Johannesburg': 'ZAR',
  'Africa/Maseru': 'ZAR',
  'Africa/Mbabane': 'ZAR',
  'Africa/Cairo': 'EGP',
  'Africa/Dar_es_Salaam': 'TZS',
  'Africa/Kampala': 'UGX',
  'Africa/Dakar': 'XOF',
  'Africa/Abidjan': 'XOF',
  'Africa/Bamako': 'XOF',
  'Africa/Ouagadougou': 'XOF',
  'Africa/Lome': 'XOF',
  'Africa/Porto-Novo': 'XOF',
  'Africa/Niamey': 'XOF',
  'Africa/Kigali': 'RWF',
  'Africa/Addis_Ababa': 'ETB',
  'Africa/Casablanca': 'MAD',
};

export function detectRegionCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_CURRENCY[tz] ?? 'USD';
  } catch {
    return 'USD';
  }
}

// ── Live exchange rates ────────────────────────────────────────────────────
// open.er-api.com is free, keyless and CORS-enabled; rates refresh daily.

const RATES_CACHE_KEY = 'nowopen-fx-rates';
const RATES_TTL_MS = 12 * 60 * 60 * 1000; // refetch twice a day

export interface RatesResult {
  rates: Record<string, number>;
  fetchedAt: number;
  live: boolean;
}

function fallbackRates(): Record<string, number> {
  return Object.fromEntries(CURRENCIES.map(c => [c.code, c.fallbackRate]));
}

export async function loadRates(): Promise<RatesResult> {
  // Serve from cache while fresh
  try {
    const cached = localStorage.getItem(RATES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as RatesResult;
      if (parsed.rates && Date.now() - parsed.fetchedAt < RATES_TTL_MS) {
        return { ...parsed, live: true };
      }
    }
  } catch { /* corrupted cache — refetch */ }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`rates API ${res.status}`);
    const data = await res.json();
    if (data?.result !== 'success' || !data.rates) throw new Error('bad rates payload');

    const rates: Record<string, number> = {};
    for (const c of CURRENCIES) {
      rates[c.code] = typeof data.rates[c.code] === 'number' ? data.rates[c.code] : c.fallbackRate;
    }
    const result: RatesResult = { rates, fetchedAt: Date.now(), live: true };
    try { localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(result)); } catch { /* ignore */ }
    return result;
  } catch (err) {
    console.warn('Live FX rates unavailable, using fallback rates:', err);
    // A stale cache still beats hardcoded fallbacks
    try {
      const cached = localStorage.getItem(RATES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as RatesResult;
        if (parsed.rates) return { ...parsed, live: true };
      }
    } catch { /* ignore */ }
    return { rates: fallbackRates(), fetchedAt: Date.now(), live: false };
  }
}

/** Format a USD amount in the target currency with sensible rounding. */
export function formatUsdAmount(
  usd: number,
  code: string,
  rate: number,
  opts: { compact?: boolean } = {}
): string {
  const amount = usd * rate;
  // Big amounts read better without decimals (₦975,000 not ₦975,000.00)
  const decimals = amount >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat(currencyInfo(code).locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
      ...(opts.compact && amount >= 10000 ? { notation: 'compact' as const, maximumFractionDigits: 1 } : {}),
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString()}`;
  }
}
