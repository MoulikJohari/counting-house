import { useEffect, useRef, useState } from 'react';
import { downloadCsv, downloadPdf, downloadXlsx, type ExportFormat } from '../lib/exportFormats';
import { IconChevronDown } from './icons';

interface Props {
  filename: string;
  title: string;
  getRows: () => { headers: string[]; rows: (string | number)[][] };
  onExported?: (msg: string) => void;
}

const OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'pdf', label: 'PDF' },
];

export function ExportMenu({ filename, title, getRows, onExported }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const runExport = async (format: ExportFormat) => {
    setOpen(false);
    const { headers, rows } = getRows();
    try {
      if (format === 'csv') downloadCsv(`${filename}.csv`, headers, rows);
      else if (format === 'xlsx') await downloadXlsx(`${filename}.xlsx`, headers, rows);
      else downloadPdf(`${filename}.pdf`, title, headers, rows);
      onExported?.(`Exported ${rows.length} row(s)`);
    } catch {
      onExported?.('Export failed');
    }
  };

  return (
    <div className="export-menu" ref={rootRef}>
      <button className="btn ghost sm" type="button" onClick={() => setOpen((o) => !o)}>
        Export <IconChevronDown />
      </button>
      {open && (
        <div className="export-menu-list">
          {OPTIONS.map((o) => (
            <button key={o.format} type="button" onClick={() => runExport(o.format)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
