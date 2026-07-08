import { invCalc, poCalc } from './ledger';
import type { Expense, Invoice, PO } from '../types';

export interface ExportRows {
  headers: string[];
  rows: (string | number)[][];
  filename: string;
}

export function posExportRows(pos: PO[], invoices: Invoice[]): ExportRows {
  const headers = ['date', 'company', 'ref', 'amount', 'gstRate', 'invoiced', 'remaining', 'notes'];
  const rows = pos.map((p) => {
    const c = poCalc(p, invoices);
    return [p.date, p.company, p.ref ?? '', c.val, p.gst_rate, c.inv, c.remaining, p.notes ?? ''];
  });
  return { headers, rows, filename: 'pos' };
}

export function invoicesExportRows(invoices: Invoice[]): ExportRows {
  const headers = [
    'date',
    'company',
    'ref',
    'dueDate',
    'taxable',
    'gstRate',
    'gst',
    'gross',
    'tdsRate',
    'tds',
    'net',
    'collected',
    'balance',
    'status',
  ];
  const rows = invoices.map((i) => {
    const c = invCalc(i);
    return [
      i.date,
      i.company,
      i.ref ?? '',
      i.due_date ?? '',
      c.taxable,
      i.gst_rate,
      Math.round(c.gst),
      Math.round(c.gross),
      i.tds_rate,
      Math.round(c.tds),
      Math.round(c.net),
      Math.round(c.collected),
      Math.round(c.balance),
      c.overdue ? 'overdue' : c.status,
    ];
  });
  return { headers, rows, filename: 'invoices' };
}

export function expensesExportRows(expenses: Expense[]): ExportRows {
  const headers = ['date', 'category', 'vendor', 'amount', 'notes'];
  const rows = expenses.map((e) => [e.date, e.category, e.vendor ?? '', e.amount, e.notes ?? '']);
  return { headers, rows, filename: 'expenses' };
}
