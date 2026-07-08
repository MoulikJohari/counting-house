import { useRef, useState } from 'react';
import { api } from '../api/client';

interface Props {
  kind: 'pos' | 'invoices' | 'expenses';
  label?: string;
  onDone: (msg: string) => void;
  onImported: () => Promise<unknown> | void;
}

export function CsvImportButton({ kind, label = 'Import CSV', onDone, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.importCsv(kind, file);
      onDone(
        res.errors.length
          ? `Imported ${res.created} row(s), ${res.errors.length} skipped`
          : `Imported ${res.created} row(s)`,
      );
      await onImported();
    } catch (err) {
      onDone(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn ghost sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Importing…' : label}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={onChange} />
    </>
  );
}
