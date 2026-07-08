import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile from 'write-excel-file/browser';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}

export async function downloadXlsx(filename: string, headers: string[], rows: (string | number)[][]) {
  const headerRow = headers.map((h) => ({ value: h, fontWeight: 'bold' as const }));
  const dataRows = rows.map((row) => row.map((cell) => ({ value: cell })));
  await writeXlsxFile([headerRow, ...dataRows]).toFile(filename);
}

export function downloadPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell))),
    startY: 20,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [31, 77, 63] },
  });
  doc.save(filename);
}
