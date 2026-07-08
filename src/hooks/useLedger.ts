import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LedgerData } from '../types';

export function useLedger() {
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
    reload().finally(() => setLoading(false));
  }, [reload]);

  return {
    data,
    loading,
    error,
    reload,
    currency: data?.currency || '₹',
    pos: data?.pos || [],
    invoices: data?.invoices || [],
    expenses: data?.expenses || [],
    recurring: data?.recurring || [],
  };
}
