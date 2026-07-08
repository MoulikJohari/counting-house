import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useCurrency } from '../hooks/useCurrency';
import type { Expense, Invoice, LedgerData, PO, Recurring } from '../types';

interface LedgerContextValue {
  data: LedgerData | null;
  loading: boolean;
  error: string;
  reload: () => Promise<LedgerData | undefined>;
  currency: string;
  pos: PO[];
  invoices: Invoice[];
  expenses: Expense[];
  recurring: Recurring[];
  onCurrency: (c: string) => Promise<void>;
  format: (amountInBase: number) => string;
  convert: (amountInBase: number) => number;
  convertToBase: (amountInSelected: number) => number;
  code: string;
  ratesLoading: boolean;
  ratesError: string;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const ledger = await api.getLedger();
      setData(ledger);
      setError('');
      return ledger;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setData(null);
      setError('');
      setLoading(true);
      return;
    }
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [user, reload]);

  const currency = data?.currency || '₹';
  const { code, ratesLoading, ratesError, convert, convertToBase, format } = useCurrency(currency);

  const onCurrency = useCallback(
    async (c: string) => {
      await api.updateSettings(c);
      await reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      reload,
      currency,
      pos: data?.pos || [],
      invoices: data?.invoices || [],
      expenses: data?.expenses || [],
      recurring: data?.recurring || [],
      onCurrency,
      format,
      convert,
      convertToBase,
      code,
      ratesLoading,
      ratesError,
    }),
    [data, loading, error, reload, currency, onCurrency, format, convert, convertToBase, code, ratesLoading, ratesError],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedgerContext() {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error('useLedgerContext must be used within LedgerProvider');
  return ctx;
}
