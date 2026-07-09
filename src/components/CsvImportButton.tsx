import { useRef, useState } from 'react';
import { api } from '../api/client';
import { downloadCsv, downloadXlsx } from '../lib/exportFormats';

interface Props {
  kind: 'pos' | 'invoices' | 'expenses';
  label?: string;
  onDone: (msg: string) => void;
  onImported: () => Promise<unknown> | void;
}

const TEMPLATE_HEADERS: Record<Props['kind'], string[]> = {
  pos: ['date', 'company', 'ref', 'amount', 'gst_rate', 'notes'],
  invoices: ['date', 'company', 'ref', 'due_date', 'po_id', 'amount', 'gst_rate', 'tds_rate', 'notes'],
  expenses: ['date', 'category', 'amount', 'vendor', 'notes'],
};

export function CsvImportButton({ kind, label = 'Import', onDone, onImported }: Props) {
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
      <button
        className="btn ghost sm"
        type="button"
        onClick={() => downloadCsv(`${kind}_template.csv`, TEMPLATE_HEADERS[kind], [])}
      >
        Download CSV Template
      </button>
      <button
        className="btn ghost sm"
        type="button"
        onClick={() => downloadXlsx(`${kind}_template.xlsx`, TEMPLATE_HEADERS[kind], [])}
      >
        Download Excel Template
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={onChange}
      />
    </>
  );
}
