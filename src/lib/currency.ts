export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';

export const BASE_CURRENCY: CurrencyCode = 'INR';

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'en-US' },
  GBP: { symbol: '£', locale: 'en-US' },
  AED: { symbol: 'AED ', locale: 'en-US' },
};

// The rest of the app persists the *symbol* the user picked (see /api/settings),
// not an ISO code. Map both ways so existing saved settings keep working as-is.
const SYMBOL_TO_CODE: Record<string, CurrencyCode> = Object.fromEntries(
  Object.entries(CURRENCY_META).map(([code, meta]) => [meta.symbol, code as CurrencyCode]),
) as Record<string, CurrencyCode>;

export function symbolToCode(symbol: string): CurrencyCode {
  return SYMBOL_TO_CODE[symbol] ?? BASE_CURRENCY;
}

const RATES_CACHE_KEY = 'ch_fx_rates_v1';
const RATES_TTL_MS = 12 * 60 * 60 * 1000; // FX moves slowly — no need to refetch on every page load

type RatesCache = { rates: Record<string, number>; fetchedAt: number };

function readRatesCache(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatesCache;
    if (Date.now() - parsed.fetchedAt > RATES_TTL_MS) return null;
    return parsed.rates;
  } catch {
    return null;
  }
}

function writeRatesCache(rates: Record<string, number>) {
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() } as RatesCache));
  } catch {
    // private mode / quota exceeded — caching is an optimization, not a requirement
  }
}

// Frankfurter: free, no API key, backed by ECB reference rates. https://frankfurter.dev
async function fetchLiveRates(): Promise<Record<string, number>> {
  const targets = Object.keys(CURRENCY_META).filter((c) => c !== BASE_CURRENCY);
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${BASE_CURRENCY}&symbols=${targets.join(',')}`);
  if (!res.ok) throw new Error('Failed to fetch exchange rates');
  const json = (await res.json()) as { rates: Record<string, number> };
  return { [BASE_CURRENCY]: 1, ...json.rates };
}

/** Rates are always base->target (1 INR = X USD/EUR/...), cached ~12h in localStorage. */
export async function getRates(): Promise<Record<string, number>> {
  const cached = readRatesCache();
  if (cached) return cached;
  const rates = await fetchLiveRates();
  writeRatesCache(rates);
  return rates;
}

export function convertAmount(amountInBase: number, rate: number) {
  return amountInBase * rate;
}

export function formatCurrency(amountInBase: number, code: CurrencyCode, rate: number) {
  const converted = convertAmount(amountInBase, rate);
  const meta = CURRENCY_META[code] ?? CURRENCY_META[BASE_CURRENCY];
  const neg = converted < 0;
  const decimals = code === BASE_CURRENCY ? 0 : 2; // INR amounts stay whole; converted values keep cents
  const abs = Math.abs(converted);
  const s = abs.toLocaleString(meta.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (neg ? '-' : '') + meta.symbol + s;
}
