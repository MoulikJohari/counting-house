import { useEffect, useMemo, useState } from 'react';
import { BASE_CURRENCY, convertToBase, formatCurrency, getRates, symbolToCode, type CurrencyCode } from '../lib/currency';

/**
 * Wraps the currently-selected currency (as stored in ledger settings, e.g. '₹' or '$')
 * with live INR -> target FX rates. `format`/`convert` recompute automatically whenever
 * `selectedSymbol` or the fetched rates change, so components re-render with the
 * converted numbers as soon as the dropdown changes.
 */
export function useCurrency(selectedSymbol: string) {
  const code: CurrencyCode = symbolToCode(selectedSymbol);
  const [rates, setRates] = useState<Record<string, number>>({ [BASE_CURRENCY]: 1 });
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesError, setRatesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getRates()
      .then((r) => {
        if (cancelled) return;
        setRates(r);
        setRatesError('');
      })
      .catch((err) => {
        if (!cancelled) setRatesError(err instanceof Error ? err.message : 'Failed to fetch exchange rates');
      })
      .finally(() => {
        if (!cancelled) setRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rate = rates[code] ?? 1;

  return useMemo(
    () => ({
      code,
      rate,
      ratesLoading,
      ratesError,
      convert: (amountInBase: number) => amountInBase * rate,
      convertToBase: (amountInSelected: number) => convertToBase(amountInSelected, rate),
      format: (amountInBase: number) => formatCurrency(amountInBase, code, rate),
    }),
    [code, rate, ratesLoading, ratesError],
  );
}
